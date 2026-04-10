import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	AnimeCarouselMeta,
	AnimeDetail,
	AnimeFeedType,
	AnimeJikanDetail,
	AnimeJikanRefreshMeta,
	AnimeSeedRecord,
	EpisodeDetail,
	EpisodeFeedType,
	EpisodeSourcesRecord,
	SyncStateMeta,
	SyncStateUpsertInput,
} from "../types/models";

export class SupabaseWriter {
	constructor(private readonly supabase: SupabaseClient) {}

	private formatError(error: unknown) {
		if (error instanceof Error) return error.message;
		if (typeof error === "string") return error;

		if (error && typeof error === "object") {
			const normalized = error as Record<string, unknown>;
			const parts = [
				normalized.message,
				normalized.code,
				normalized.details,
				normalized.hint,
			]
				.filter((value) => typeof value === "string" && value.trim().length > 0)
				.map((value) => String(value));

			if (parts.length > 0) return parts.join(" | ");

			try {
				return JSON.stringify(normalized);
			} catch {
				return String(error);
			}
		}

		return String(error);
	}

	private async execute<T extends { error: unknown }>(
		operation: PromiseLike<T>,
		context: string,
	): Promise<T> {
		const result = await operation;
		if (result.error) {
			throw new Error(`${context}: ${this.formatError(result.error)}`);
		}
		return result;
	}

	async upsertAnimeFeedItems(
		feedType: AnimeFeedType,
		animeIds: string[],
		page = 1,
	) {
		const feedFetchedAt = new Date().toISOString();
		const dedupedAnimeIds = Array.from(
			new Set(animeIds.map((animeId) => animeId.trim()).filter(Boolean)),
		);

		if (dedupedAnimeIds.length === 0) return;

		await this.execute(
			this.supabase.rpc("replace_anime_feed_page", {
				p_feed_type: feedType,
				p_page: page,
				p_anime_ids: dedupedAnimeIds,
				p_feed_fetched_at: feedFetchedAt,
			}),
			"replace anime_feed_items",
		);
	}

	async ensureAnimeRecords(records: AnimeSeedRecord[]) {
		if (records.length === 0) return;

		const dedupedByAnimeId = new Map<
			string,
			{
				animeId: string;
				title: string;
				type: string;
				originalLink: string | null;
			}
		>();
		for (const record of records) {
			if (
				!record.animeId ||
				!record.title ||
				dedupedByAnimeId.has(record.animeId)
			)
				continue;

			dedupedByAnimeId.set(record.animeId, {
				animeId: record.animeId,
				title: record.title,
				type: record.type ?? "Anime",
				originalLink: record.originalLink ?? null,
			});
		}

		const deduped = Array.from(dedupedByAnimeId.values());

		if (deduped.length === 0) return;

		await this.execute(
			this.supabase
				.from("animes")
				.upsert(deduped, { onConflict: "animeId", ignoreDuplicates: true }),
			"upsert anime seed records",
		);
	}

	async upsertEpisodeFeedItems(
		feedType: EpisodeFeedType,
		episodeIds: string[],
	) {
		const feedFetchedAt = new Date().toISOString();
		const dedupedEpisodeIds = Array.from(
			new Set(episodeIds.map((episodeId) => episodeId.trim()).filter(Boolean)),
		);

		if (dedupedEpisodeIds.length === 0) return;

		await this.execute(
			this.supabase.rpc("replace_episode_feed", {
				p_feed_type: feedType,
				p_episode_ids: dedupedEpisodeIds,
				p_feed_fetched_at: feedFetchedAt,
			}),
			"replace episode_feed_items",
		);
	}

	async upsertAnimeDetails(anime: AnimeDetail) {
		await this.execute(
			this.supabase.from("animes").upsert(
				[
					{
						animeId: anime.animeId,
						title: anime.title,
						otherTitles: anime.otherTitles ?? null,
						cover_image_key: anime.coverImageKey ?? null,
						carousel_image_keys: anime.carouselImageKeys ?? [],
						description: anime.description ?? null,
						originalLink: anime.originalLink ?? null,
						status: anime.status ?? null,
						type: anime.type ?? null,
						genres: anime.genres ?? null,
						images: anime.images ?? null,
					},
				],
				{ onConflict: "animeId" },
			),
			"upsert animes",
		);

		if (!anime.relatedAnimes || anime.relatedAnimes.length === 0) {
			return;
		}

		await this.execute(
			this.supabase.from("related_animes").upsert(
				anime.relatedAnimes.map((relatedAnime) => ({
					anime_id: anime.animeId,
					related_id: relatedAnime.animeId,
					title: relatedAnime.title,
					relation: relatedAnime.relation,
				})),
				{ onConflict: "anime_id,related_id,relation" },
			),
			"upsert related_animes",
		);
	}

	async upsertAnimeJikanDetail(detail: AnimeJikanDetail) {
		await this.execute(
			this.supabase.from("anime_jikan_details").upsert(
				[
					{
						anime_id: detail.animeId,
						mal_id: detail.malId,
						mal_url: detail.malUrl,
						matched_query: detail.matchedQuery,
						matched_title: detail.matchedTitle,
						match_score: detail.matchScore,
						title: detail.title,
						title_english: detail.titleEnglish ?? null,
						title_japanese: detail.titleJapanese ?? null,
						synopsis: detail.synopsis ?? null,
						background: detail.background ?? null,
						type: detail.type ?? null,
						status: detail.status ?? null,
						rating: detail.rating ?? null,
						source: detail.source ?? null,
						season: detail.season ?? null,
						year: detail.year ?? null,
						episodes: detail.episodes ?? null,
						duration: detail.duration ?? null,
						score: detail.score ?? null,
						scored_by: detail.scoredBy ?? null,
						rank: detail.rank ?? null,
						popularity: detail.popularity ?? null,
						members: detail.members ?? null,
						favorites: detail.favorites ?? null,
						titles: detail.titles,
						images: detail.images,
						trailer: detail.trailer,
						promos: detail.promos,
						genres: detail.genres,
						studios: detail.studios,
						external_links: detail.externalLinks,
						streaming_links: detail.streamingLinks,
						relations: detail.relations,
						jikan_fetched_at: detail.jikanFetchedAt,
						jikan_expires_at: detail.jikanExpiresAt,
					},
				],
				{ onConflict: "anime_id" },
			),
			"upsert anime_jikan_details",
		);
	}

	async upsertEpisodes(episodes: EpisodeDetail[]) {
		if (episodes.length === 0) return;

		await this.execute(
			this.supabase.from("episodes").upsert(
				episodes.map((episode) => ({
					episodeId: episode.episodeId,
					animeId: episode.animeId,
					episode: episode.episode,
					title: episode.title ?? null,
					originalLink: episode.originalLink ?? null,
					image: episode.image ?? null,
				})),
				{ onConflict: "episodeId" },
			),
			"upsert episodes",
		);
	}

	async upsertEpisodeSources(record: EpisodeSourcesRecord) {
		await this.upsertEpisodeSourcesBatch([record]);
	}

	async upsertEpisodeSourcesBatch(records: EpisodeSourcesRecord[]) {
		if (records.length === 0) return;

		await this.execute(
			this.supabase.from("episode_sources").upsert(
				records.map((record) => ({
					episode_id: record.episodeId,
					episode: record.episode,
					videos: record.videos,
					scraped_at: record.scrapedAt,
					expires_at: record.expiresAt,
				})),
				{ onConflict: "episode_id" },
			),
			"upsert episode_sources",
		);
	}

	async markSyncState(
		resourceType: string,
		resourceId: string,
		status: "success" | "error",
		errorMessage?: string,
	) {
		await this.execute(
			this.supabase.from("sync_state").upsert(
				[
					{
						resource_type: resourceType,
						resource_id: resourceId,
						status,
						last_success_at:
							status === "success" ? new Date().toISOString() : null,
						last_error_at: status === "error" ? new Date().toISOString() : null,
						error_message: errorMessage ?? null,
						error_count: status === "error" ? 1 : 0,
					},
				],
				{ onConflict: "resource_type,resource_id" },
			),
			"upsert sync_state",
		);
	}

	async upsertSyncState(input: SyncStateUpsertInput) {
		await this.upsertSyncStates([input]);
	}

	async upsertSyncStates(inputs: SyncStateUpsertInput[]) {
		if (inputs.length === 0) return;

		await this.execute(
			this.supabase.from("sync_state").upsert(
				inputs.map((input) => ({
					resource_type: input.resourceType,
					resource_id: input.resourceId,
					status: input.status,
					last_success_at: input.lastSuccessAt ?? null,
					last_error_at: input.lastErrorAt ?? null,
					error_count: input.errorCount ?? 0,
					error_message: input.errorMessage ?? null,
					next_run_at: input.nextRunAt ?? null,
				})),
				{ onConflict: "resource_type,resource_id" },
			),
			"upsert sync_state full",
		);
	}

	async getSyncState(
		resourceType: string,
		resourceId: string,
	): Promise<SyncStateMeta | null> {
		const results = await this.getSyncStates(resourceType, [resourceId]);
		return results.get(resourceId) ?? null;
	}

	async getSyncStates(
		resourceType: string,
		resourceIds: string[],
	): Promise<Map<string, SyncStateMeta>> {
		const uniqueResourceIds = Array.from(new Set(resourceIds)).filter(Boolean);
		if (uniqueResourceIds.length === 0) return new Map();

		const { data } = await this.execute(
			this.supabase
				.from("sync_state")
				.select(
					"resource_type,resource_id,status,last_success_at,last_error_at,error_count,error_message,next_run_at",
				)
				.eq("resource_type", resourceType)
				.in("resource_id", uniqueResourceIds),
			"select sync_state",
		);
		const items = (data ?? []) as Array<{
			resource_type: string;
			resource_id: string;
			status: "pending" | "running" | "success" | "error";
			last_success_at: string | null;
			last_error_at: string | null;
			error_count: number | null;
			error_message: string | null;
			next_run_at: string | null;
		}>;

		return new Map(
			items.map((item) => [
				item.resource_id,
				{
					resourceType: item.resource_type,
					resourceId: item.resource_id,
					status: item.status,
					lastSuccessAt: item.last_success_at,
					lastErrorAt: item.last_error_at,
					errorCount: item.error_count ?? 0,
					errorMessage: item.error_message,
					nextRunAt: item.next_run_at,
				} satisfies SyncStateMeta,
			]),
		);
	}

	async getAnimeCarouselMeta(
		animeId: string,
	): Promise<AnimeCarouselMeta | null> {
		const results = await this.getAnimeCarouselMetas([animeId]);
		return results.get(animeId) ?? null;
	}

	async getAnimeCarouselMetas(
		animeIds: string[],
	): Promise<Map<string, AnimeCarouselMeta>> {
		const uniqueAnimeIds = Array.from(new Set(animeIds)).filter(Boolean);
		if (uniqueAnimeIds.length === 0) return new Map();

		const { data } = await this.execute(
			this.supabase
				.from("animes")
				.select(
					"animeId,title,otherTitles,images,cover_image_key,carousel_image_keys",
				)
				.in("animeId", uniqueAnimeIds),
			"select anime carousel meta",
		);
		const items = (data ?? []) as Array<{
			animeId: string;
			title: string;
			otherTitles: string[] | null;
			images: AnimeDetail["images"] | null;
			cover_image_key: string | null;
			carousel_image_keys: unknown;
		}>;

		return new Map(
			items.map((item) => {
				const carouselImageKeys = Array.isArray(item.carousel_image_keys)
					? item.carousel_image_keys.filter(
							(value): value is string => typeof value === "string",
						)
					: [];

				return [
					item.animeId,
					{
						animeId: item.animeId,
						title: item.title,
						otherTitles: item.otherTitles ?? [],
						images: item.images ?? null,
						coverImageKey: item.cover_image_key ?? null,
						carouselImageKeys,
					} satisfies AnimeCarouselMeta,
				];
			}),
		);
	}

	async updateAnimeCarouselImages(
		animeId: string,
		images: AnimeDetail["images"],
		carouselImageKeys: string[],
	) {
		await this.execute(
			this.supabase
				.from("animes")
				.update({
					images,
					carousel_image_keys: carouselImageKeys,
				})
				.eq("animeId", animeId),
			"update anime carousel images",
		);
	}

	async getAnimeIdsFromFeed(limit = 200) {
		const { data } = await this.execute(
			this.supabase
				.from("anime_feed_items")
				.select("anime_id")
				.order("updated_at", { ascending: false })
				.limit(limit),
			"select anime_feed_items",
		);

		const items = (data ?? []) as Array<{ anime_id: string }>;
		return Array.from(new Set(items.map((item) => item.anime_id)));
	}

	async getAnimeJikanRefreshMeta(
		animeId: string,
	): Promise<AnimeJikanRefreshMeta | null> {
		const { data } = await this.execute(
			this.supabase
				.from("anime_jikan_details")
				.select("mal_id,jikan_expires_at")
				.eq("anime_id", animeId)
				.limit(1),
			"select anime_jikan_details refresh meta",
		);

		const items = (data ?? []) as Array<{
			mal_id: number | null;
			jikan_expires_at: string | null;
		}>;
		const item = items[0];
		if (!item) return null;

		return {
			malId: item.mal_id ?? null,
			jikanExpiresAt: item.jikan_expires_at ?? null,
		};
	}

	async getAnimeJikanRefreshMetas(
		animeIds: string[],
	): Promise<Map<string, AnimeJikanRefreshMeta>> {
		const uniqueAnimeIds = Array.from(new Set(animeIds)).filter(Boolean);
		if (uniqueAnimeIds.length === 0) return new Map();

		const { data } = await this.execute(
			this.supabase
				.from("anime_jikan_details")
				.select("anime_id,mal_id,jikan_expires_at")
				.in("anime_id", uniqueAnimeIds),
			"select anime_jikan_details refresh meta",
		);
		const items = (data ?? []) as Array<{
			anime_id: string;
			mal_id: number | null;
			jikan_expires_at: string | null;
		}>;

		return new Map(
			items.map((item) => [
				item.anime_id,
				{
					malId: item.mal_id ?? null,
					jikanExpiresAt: item.jikan_expires_at ?? null,
				} satisfies AnimeJikanRefreshMeta,
			]),
		);
	}

	async getRecentEpisodeIds(limit = 200, daysWindow = 7) {
		const fromDate = new Date(
			Date.now() - daysWindow * 24 * 60 * 60 * 1000,
		).toISOString();
		const { data } = await this.execute(
			this.supabase
				.from("episodes")
				.select("episodeId")
				.gte("updated_at", fromDate)
				.order("updated_at", { ascending: false })
				.limit(limit),
			"select episodes",
		);

		const items = (data ?? []) as Array<{ episodeId: string }>;
		return Array.from(new Set(items.map((item) => item.episodeId)));
	}

	async getMaxEpisodeNumberByAnimeId(animeId: string) {
		const { data } = await this.execute(
			this.supabase
				.from("episodes")
				.select("episode")
				.eq("animeId", animeId)
				.order("episode", { ascending: false })
				.limit(1),
			"select max episode by anime",
		);

		const items = (data ?? []) as Array<{ episode: number | null }>;
		const maxEpisode = items[0]?.episode;
		return typeof maxEpisode === "number" && Number.isFinite(maxEpisode)
			? maxEpisode
			: 0;
	}

	async getMaxEpisodeNumbersByAnimeIds(
		animeIds: string[],
	): Promise<Map<string, number>> {
		const uniqueAnimeIds = Array.from(new Set(animeIds)).filter(Boolean);
		if (uniqueAnimeIds.length === 0) return new Map();

		const { data } = await this.execute(
			this.supabase
				.from("episodes")
				.select("animeId,episode")
				.in("animeId", uniqueAnimeIds),
			"select max episode by anime",
		);
		const items = (data ?? []) as Array<{
			animeId: string;
			episode: number | null;
		}>;
		const result = new Map<string, number>();

		for (const animeId of uniqueAnimeIds) {
			result.set(animeId, 0);
		}

		for (const item of items) {
			if (!result.has(item.animeId)) continue;
			const episode =
				typeof item.episode === "number" && Number.isFinite(item.episode)
					? item.episode
					: 0;
			const current = result.get(item.animeId) ?? 0;
			if (episode > current) {
				result.set(item.animeId, episode);
			}
		}

		return result;
	}

	async getEpisodeIdsNeedingSourceRefresh(
		limit = 200,
		daysWindow = 7,
		now = new Date(),
	) {
		const episodeIds = await this.getRecentEpisodeIds(limit, daysWindow);
		if (episodeIds.length === 0) return [];

		const { data } = await this.execute(
			this.supabase
				.from("episode_sources")
				.select("episode_id,expires_at")
				.in("episode_id", episodeIds),
			"select episode_sources",
		);

		const sourceRows = (data ?? []) as Array<{
			episode_id: string;
			expires_at: string | null;
		}>;
		const expiryByEpisodeId = new Map(
			sourceRows.map((row) => [row.episode_id, row.expires_at]),
		);
		const nowMs = now.getTime();

		return episodeIds.filter((episodeId) => {
			const expiresAt = expiryByEpisodeId.get(episodeId);
			if (!expiresAt) return true;

			const expiresAtMs = new Date(expiresAt).getTime();
			return !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs;
		});
	}
}
