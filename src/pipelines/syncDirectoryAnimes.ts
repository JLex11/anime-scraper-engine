import { fetchAnimeFlvHtml } from '../clients/animeflvClient'
import { extractAnimeIds } from '../extractors/extractIds'
import type { PipelineContext } from './context'

export const syncDirectoryAnimes = async (ctx: PipelineContext, pages = 3) => {
	for (let page = 1; page <= pages; page += 1) {
		const html = await fetchAnimeFlvHtml(`/browse?page=${page}`)
		if (!html) {
			ctx.logger.warn('syncDirectoryAnimes: page unavailable', { page })
			continue
		}

		const animeIds = await extractAnimeIds(html, 'ul.ListAnimes li a')
		await ctx.writer.upsertAnimeFeedItems('directory', animeIds, page)
	}

	await ctx.writer.markSyncState('feed', 'directory_animes', 'success')
}
