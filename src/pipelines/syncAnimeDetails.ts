import type { JikanAnimeFull, JikanAnimeVideos } from '../clients/jikanClient'
import { extractAnimeDetail } from '../extractors/extractAnimeDetail'
import { createConcurrencyLimiter, runWithConcurrency } from '../utils/concurrency'
import { matchJikanAnime } from '../utils/jikanMatcher'
import type { AnimeDetail, AnimeJikanDetail } from '../types/models'
import type { PipelineContext } from './context'

const JIKAN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const JIKAN_CONCURRENCY = 2

const isFreshJikanMeta = (expiresAt: string | null | undefined, now: Date) => {
	if (!expiresAt) return false
	const expiresAtMs = new Date(expiresAt).getTime()
	return Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime()
}

const mapJikanDetail = (
	animeId: string,
	matchedQuery: string,
	matchedTitle: string,
	matchScore: number,
	full: JikanAnimeFull,
	videos: JikanAnimeVideos,
	now = new Date()
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
})

const syncJikanEnrichment = async (ctx: PipelineContext, detail: AnimeDetail) => {
	try {
		const now = new Date()
		const refreshMeta = await ctx.writer.getAnimeJikanRefreshMeta(detail.animeId)

		if (isFreshJikanMeta(refreshMeta?.jikanExpiresAt, now)) {
			await ctx.writer.markSyncState('anime_jikan_detail', detail.animeId, 'success')
			return
		}

		let full: JikanAnimeFull | null = null
		let videos: JikanAnimeVideos | null = null
		let matchedTitle = detail.title
		let matchScore = 1

		if (refreshMeta?.malId) {
			full = await ctx.jikanClient.getAnimeFull(refreshMeta.malId)
			videos = await ctx.jikanClient.getAnimeVideos(refreshMeta.malId)
			matchedTitle = full?.title ?? detail.title
		} else {
			const searchResults = await ctx.jikanClient.searchAnime(detail.title, 10)
			const match = matchJikanAnime(detail.title, detail.type, searchResults)
			if (!match) {
				ctx.logger.warn('syncAnimeDetails: no confident Jikan match', {
					animeId: detail.animeId,
					title: detail.title,
					type: detail.type ?? null,
				})
				await ctx.writer.markSyncState('anime_jikan_detail', detail.animeId, 'error', 'No confident Jikan match')
				return
			}

			full = await ctx.jikanClient.getAnimeFull(match.result.mal_id)
			videos = await ctx.jikanClient.getAnimeVideos(match.result.mal_id)
			matchedTitle = match.matchedTitle
			matchScore = match.score
		}

		if (!full || !videos) {
			await ctx.writer.markSyncState('anime_jikan_detail', detail.animeId, 'error', 'Jikan detail unavailable')
			return
		}

		const jikanDetail = mapJikanDetail(detail.animeId, detail.title, matchedTitle, matchScore, full, videos, now)
		await ctx.writer.upsertAnimeJikanDetail(jikanDetail)
		await ctx.writer.markSyncState('anime_jikan_detail', detail.animeId, 'success')
	} catch (error) {
		await ctx.writer.markSyncState('anime_jikan_detail', detail.animeId, 'error', String(error))
	}
}

export const syncAnimeDetails = async (ctx: PipelineContext, animeIds: string[]) => {
	const uniqueIds = Array.from(new Set(animeIds)).filter(Boolean)
	if (uniqueIds.length === 0) return

	const limitJikan = createConcurrencyLimiter(JIKAN_CONCURRENCY)

	await runWithConcurrency(uniqueIds, ctx.config.maxConcurrency, async (animeId) => {
		try {
			const html = await ctx.fetchHtml(`/anime/${animeId}`)
			if (!html) {
				await ctx.writer.markSyncState('anime_detail', animeId, 'error', 'Anime detail page unavailable')
				return
			}

			const detail = await extractAnimeDetail(animeId, html)
			if (!detail) {
				await ctx.writer.markSyncState('anime_detail', animeId, 'error', 'Could not parse anime detail')
				return
			}

			if (detail.images?.coverImage && ctx.r2Writer?.isEnabled()) {
				try {
					const mirrored = await ctx.r2Writer.mirrorFromUrl(detail.images.coverImage, `animes/${animeId}`)
					detail.images.coverImage = mirrored.url
					detail.coverImageKey = mirrored.key
				} catch (error) {
					ctx.logger.warn('syncAnimeDetails: cover mirror failed', {
						animeId,
						error: String(error),
					})
				}
			}

			await ctx.writer.upsertAnimeDetails(detail)
			await ctx.writer.markSyncState('anime_detail', animeId, 'success')
			await limitJikan(() => syncJikanEnrichment(ctx, detail))
		} catch (error) {
			await ctx.writer.markSyncState('anime_detail', animeId, 'error', String(error))
		}
	})
}
