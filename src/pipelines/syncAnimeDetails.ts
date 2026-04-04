import type { JikanAnimeFull, JikanAnimeVideos } from "../clients/jikanClient";
import { extractAnimeDetail } from "../extractors/extractAnimeDetail";
import type {
	AnimeDetail,
	AnimeJikanDetail,
	AnimeJikanRefreshMeta,
	CachedJikanMatchMeta,
	SyncStateUpsertInput,
} from "../types/models";
import {
	createConcurrencyLimiter,
	runWithConcurrency,
} from "../utils/concurrency";
import {
	createJikanSearchQueries,
	matchJikanAnime,
} from "../utils/jikanMatcher";
import type { PipelineContext } from "./context";
import { loadAnimePage } from "./pageAccess";

const JIKAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const JIKAN_CONCURRENCY = 2;

const isFreshJikanMeta = (expiresAt: string | null | undefined, now: Date) => {
	if (!expiresAt) return false;
	const expiresAtMs = new Date(expiresAt).getTime();
	return Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime();
};

const successState = (
	resourceType: string,
	resourceId: string,
	now = new Date(),
): SyncStateUpsertInput => ({
	resourceType,
	resourceId,
	status: "success",
	lastSuccessAt: now.toISOString(),
	lastErrorAt: null,
	errorCount: 0,
	errorMessage: null,
});

const errorState = (
	resourceType: string,
	resourceId: string,
	message: string,
	now = new Date(),
): SyncStateUpsertInput => ({
	resourceType,
	resourceId,
	status: "error",
	lastSuccessAt: null,
	lastErrorAt: now.toISOString(),
	errorCount: 1,
	errorMessage: message,
});

const mapJikanDetail = (
	animeId: string,
	matchedQuery: string,
	matchedTitle: string,
	matchScore: number,
	full: JikanAnimeFull,
	videos: JikanAnimeVideos,
	now = new Date(),
): AnimeJikanDetail => ({
	animeId,
	malId: full.mal_id,
	malUrl: full.url,
	matchedQuery,
	matchedTitle,
	matchScore,
	title: full.title,
	titleEnglish: full.title_english,
	titleJapanese: full.title_japanese,
	synopsis: full.synopsis,
	background: full.background,
	type: full.type,
	status: full.status,
	rating: full.rating,
	source: full.source,
	season: full.season,
	year: full.year,
	episodes: full.episodes,
	duration: full.duration,
	score: full.score,
	scoredBy: full.scored_by,
	rank: full.rank,
	popularity: full.popularity,
	members: full.members,
	favorites: full.favorites,
	titles: full.titles ?? [],
	images: full.images ?? null,
	trailer: full.trailer ?? null,
	promos: videos.promo ?? [],
	genres: full.genres ?? [],
	studios: full.studios ?? [],
	externalLinks: full.external ?? [],
	streamingLinks: full.streaming ?? [],
	relations: full.relations ?? [],
	jikanFetchedAt: now.toISOString(),
	jikanExpiresAt: new Date(now.getTime() + JIKAN_TTL_MS).toISOString(),
});

const getLookupTitles = (detail: AnimeDetail) =>
	Array.from(
		new Set(
			[detail.title, ...(detail.otherTitles ?? [])]
				.map((value) => value.trim())
				.filter(Boolean),
		),
	);

const fetchJikanPayload = async (
	ctx: PipelineContext,
	malId: number,
) => {
	const [full, videos] = await Promise.all([
		ctx.jikanClient.getAnimeFull(malId),
		ctx.jikanClient.getAnimeVideos(malId),
	]);
	return { full, videos };
};

const syncJikanEnrichment = async (
	ctx: PipelineContext,
	detail: AnimeDetail,
	refreshMeta: AnimeJikanRefreshMeta | null,
): Promise<SyncStateUpsertInput> => {
	const now = new Date();

	try {
		if (isFreshJikanMeta(refreshMeta?.jikanExpiresAt, now)) {
			return successState("anime_jikan_detail", detail.animeId, now);
		}

		let full: JikanAnimeFull | null = null;
		let videos: JikanAnimeVideos | null = null;
		let matchedTitle = detail.title;
		let matchedQuery = detail.title;
		let matchScore = 1;

		if (refreshMeta?.malId) {
			({ full, videos } = await fetchJikanPayload(ctx, refreshMeta.malId));
			matchedTitle = full?.title ?? detail.title;
		} else {
			const cachedMatch = await ctx.jikanMatchLoader?.get(detail.animeId);
			if (cachedMatch?.malId) {
				({ full, videos } = await fetchJikanPayload(ctx, cachedMatch.malId));
				matchedQuery = cachedMatch.matchedQuery;
				matchedTitle = cachedMatch.matchedTitle;
				matchScore = cachedMatch.matchScore;
			} else {
				let match = null as ReturnType<typeof matchJikanAnime> | null;
				let searchResults = [] as Awaited<
					ReturnType<typeof ctx.jikanClient.searchAnime>
				>;
				const lookupTitles = getLookupTitles(detail);
				const attemptedSearches: Array<{
					lookupTitle: string;
					query: string;
					resultCount: number;
				}> = [];

				for (const lookupTitle of lookupTitles) {
					for (const query of createJikanSearchQueries(lookupTitle)) {
						searchResults = await ctx.jikanClient.searchAnime(query, 10);
						attemptedSearches.push({
							lookupTitle,
							query,
							resultCount: searchResults.length,
						});
						match = matchJikanAnime(lookupTitle, detail.type, searchResults);
						if (match) {
							matchedQuery = query;
							matchedTitle = match.matchedTitle;
							matchScore = match.score;
							break;
						}
					}
					if (match) break;
				}

				if (!match) {
					ctx.logger.warn("syncAnimeDetails: no confident Jikan match", {
						animeId: detail.animeId,
						title: detail.title,
						otherTitles: detail.otherTitles ?? [],
						type: detail.type ?? null,
						resultCount: searchResults.length,
						attemptedSearches,
					});
					return errorState(
						"anime_jikan_detail",
						detail.animeId,
						"No confident Jikan match",
						now,
					);
				}

				const cachedMatchMeta: CachedJikanMatchMeta = {
					animeId: detail.animeId,
					malId: match.result.mal_id,
					matchedQuery,
					matchedTitle,
					matchScore,
					cachedAt: now.toISOString(),
				};
				await ctx.jikanMatchLoader?.set(cachedMatchMeta);
				({ full, videos } = await fetchJikanPayload(ctx, match.result.mal_id));
			}
		}

		if (!full || !videos) {
			return errorState(
				"anime_jikan_detail",
				detail.animeId,
				"Jikan detail unavailable",
				now,
			);
		}

		await ctx.writer.upsertAnimeJikanDetail(
			mapJikanDetail(
				detail.animeId,
				matchedQuery,
				matchedTitle,
				matchScore,
				full,
				videos,
				now,
			),
		);

		return successState("anime_jikan_detail", detail.animeId, now);
	} catch (error) {
		return errorState(
			"anime_jikan_detail",
			detail.animeId,
			String(error),
			now,
		);
	}
};

export const syncAnimeDetails = async (
	ctx: PipelineContext,
	animeIds: string[],
) => {
	const uniqueIds = Array.from(new Set(animeIds)).filter(Boolean);
	if (uniqueIds.length === 0) return;

	const refreshMetaByAnimeId = await ctx.writer.getAnimeJikanRefreshMetas(uniqueIds);
	const limitJikan = createConcurrencyLimiter(JIKAN_CONCURRENCY);

	const results = await runWithConcurrency(
		uniqueIds,
		ctx.config.maxConcurrency,
		async (animeId) => {
			try {
				const html = await loadAnimePage(ctx, animeId);
				if (!html) {
					return {
						detailState: errorState(
							"anime_detail",
							animeId,
							"Anime detail page unavailable",
						),
						jikanState: null,
					};
				}

				const detail = await extractAnimeDetail(animeId, html);
				if (!detail) {
					return {
						detailState: errorState(
							"anime_detail",
							animeId,
							"Could not parse anime detail",
						),
						jikanState: null,
					};
				}

				if (detail.images?.coverImage && ctx.r2Writer?.isEnabled()) {
					try {
						const mirrored = await ctx.r2Writer.mirrorFromUrl(
							detail.images.coverImage,
							`animes/${animeId}`,
						);
						detail.coverImageKey = mirrored.key;
						if (ctx.config.r2PublicBaseUrl) {
							detail.images.coverImage = mirrored.url;
						}
					} catch (error) {
						ctx.logger.warn("syncAnimeDetails: cover mirror failed", {
							animeId,
							error: String(error),
						});
					}
				}

				await ctx.writer.upsertAnimeDetails(detail);

				return {
					detailState: successState("anime_detail", animeId),
					jikanState: await limitJikan(() =>
						syncJikanEnrichment(
							ctx,
							detail,
							refreshMetaByAnimeId.get(animeId) ?? null,
						),
					),
				};
			} catch (error) {
				return {
					detailState: errorState("anime_detail", animeId, String(error)),
					jikanState: null,
				};
			}
		},
	);

	const detailStates = results.map((result) => result.detailState);
	const jikanStates = results
		.map((result) => result.jikanState)
		.filter((value): value is SyncStateUpsertInput => value !== null);

	await ctx.writer.upsertSyncStates([...detailStates, ...jikanStates]);
};
