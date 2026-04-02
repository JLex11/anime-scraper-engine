import { fetchAnimeFlvHtml } from '../clients/animeflvClient'
import { extractAnimeIds } from '../extractors/extractIds'
import { syncAnimeDetails } from './syncAnimeDetails'
import { syncAnimeEpisodes } from './syncAnimeEpisodes'
import type { PipelineContext } from './context'

export const syncLatestAnimes = async (ctx: PipelineContext) => {
	const html = await fetchAnimeFlvHtml('/')
	if (!html) {
		ctx.logger.warn('syncLatestAnimes: homepage unavailable')
		return
	}

	const animeIds = await extractAnimeIds(html, 'ul.ListAnimes li a')
	await ctx.writer.upsertAnimeFeedItems('latest', animeIds.slice(0, 30), 1)
	await ctx.writer.markSyncState('feed', 'latest_animes', 'success')

	// Keep details and episodes warm for top entries.
	const discoveredIds = animeIds.slice(0, 30)
	await syncAnimeDetails(ctx, discoveredIds)
	await syncAnimeEpisodes(ctx, discoveredIds)
}
