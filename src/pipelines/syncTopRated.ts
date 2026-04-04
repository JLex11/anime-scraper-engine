import { extractAnimeIds } from '../extractors/extractIds'
import { buildAnimeSeed } from '../utils/animeSeed'
import { syncAnimeDetails } from './syncAnimeDetails'
import type { PipelineContext } from './context'
import { loadTopRatedPage } from './pageAccess'

const FEED_LIMIT = 40
const DETAIL_WARM_LIMIT = 3

export const syncTopRated = async (ctx: PipelineContext) => {
	const html = await loadTopRatedPage(ctx)
	if (!html) {
		ctx.logger.warn('syncTopRated: rating page unavailable')
		await ctx.writer.markSyncState('feed', 'rating_animes', 'error', 'Rating page unavailable')
		return
	}

	const animeIds = await extractAnimeIds(html, 'ul.ListAnimes li a')
	const topRatedIds = animeIds.slice(0, FEED_LIMIT)
	await ctx.writer.ensureAnimeRecords(topRatedIds.map((animeId) => buildAnimeSeed(animeId)))
	await ctx.writer.upsertAnimeFeedItems('rating', topRatedIds, 1)
	await ctx.writer.markSyncState('feed', 'rating_animes', 'success')
	await syncAnimeDetails(ctx, topRatedIds.slice(0, DETAIL_WARM_LIMIT))
}
