import { fetchAnimeFlvHtml } from '../clients/animeflvClient'
import { extractAnimeIds } from '../extractors/extractIds'
import { syncAnimeDetails } from './syncAnimeDetails'
import type { PipelineContext } from './context'

export const syncTopRated = async (ctx: PipelineContext) => {
	const html = await fetchAnimeFlvHtml('/browse?status=1&order=rating')
	if (!html) {
		ctx.logger.warn('syncTopRated: rating page unavailable')
		return
	}

	const animeIds = await extractAnimeIds(html, 'ul.ListAnimes li a')
	await ctx.writer.upsertAnimeFeedItems('rating', animeIds.slice(0, 40), 1)
	await ctx.writer.markSyncState('feed', 'rating_animes', 'success')
	await syncAnimeDetails(ctx, animeIds.slice(0, 40))
}
