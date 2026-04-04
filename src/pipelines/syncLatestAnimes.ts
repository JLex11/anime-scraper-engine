import { extractAnimeIds } from '../extractors/extractIds'
import { buildAnimeSeed } from '../utils/animeSeed'
import { syncAnimeDetails } from './syncAnimeDetails'
import type { PipelineContext } from './context'
import { loadHomepage } from './pageAccess'

const FEED_LIMIT = 30
const DETAIL_WARM_LIMIT = 3

export const syncLatestAnimes = async (ctx: PipelineContext) => {
	const html = await loadHomepage(ctx)
	if (!html) {
		ctx.logger.warn('syncLatestAnimes: homepage unavailable')
		await ctx.writer.markSyncState('feed', 'latest_animes', 'error', 'Homepage unavailable')
		return
	}

	const animeIds = await extractAnimeIds(html, 'ul.ListAnimes li a')
	const discoveredIds = animeIds.slice(0, FEED_LIMIT)
	await ctx.writer.ensureAnimeRecords(discoveredIds.map((animeId) => buildAnimeSeed(animeId)))
	await ctx.writer.upsertAnimeFeedItems('latest', discoveredIds, 1)
	await ctx.writer.markSyncState('feed', 'latest_animes', 'success')

	// Keep a small slice of details warm without exceeding Worker subrequest budgets.
	await syncAnimeDetails(ctx, discoveredIds.slice(0, DETAIL_WARM_LIMIT))
}
