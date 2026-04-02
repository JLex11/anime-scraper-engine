import { fetchAnimeFlvHtml } from '../clients/animeflvClient'
import { extractAnimeIds } from '../extractors/extractIds'
import { syncAnimeDetails } from './syncAnimeDetails'
import type { PipelineContext } from './context'

export const syncBroadcast = async (ctx: PipelineContext) => {
	const html = await fetchAnimeFlvHtml('/')
	if (!html) {
		ctx.logger.warn('syncBroadcast: homepage unavailable')
		return
	}

	const animeIds = await extractAnimeIds(html, '.Emision .ListSdbr li a')
	await ctx.writer.upsertAnimeFeedItems('broadcast', animeIds.slice(0, 40), 1)
	await ctx.writer.markSyncState('feed', 'broadcast_animes', 'success')
	await syncAnimeDetails(ctx, animeIds.slice(0, 40))
}
