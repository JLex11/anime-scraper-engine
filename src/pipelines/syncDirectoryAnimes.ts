import { extractAnimeIds } from '../extractors/extractIds'
import { buildAnimeSeed } from '../utils/animeSeed'
import type { PipelineContext } from './context'
import { loadDirectoryPage } from './pageAccess'

export const syncDirectoryAnimes = async (ctx: PipelineContext, pages = 3) => {
	let successPages = 0
	const failedPages: number[] = []

	for (let page = 1; page <= pages; page += 1) {
		const html = await loadDirectoryPage(ctx, page)
		if (!html) {
			ctx.logger.warn('syncDirectoryAnimes: page unavailable', { page })
			failedPages.push(page)
			continue
		}

		const animeIds = await extractAnimeIds(html, 'ul.ListAnimes li a')
		await ctx.writer.ensureAnimeRecords(animeIds.map((animeId) => buildAnimeSeed(animeId)))
		await ctx.writer.upsertAnimeFeedItems('directory', animeIds, page)
		successPages += 1
	}

	if (successPages === 0) {
		await ctx.writer.markSyncState('feed', 'directory_animes', 'error', 'No directory pages available')
		return
	}

	if (failedPages.length > 0) {
		await ctx.writer.markSyncState(
			'feed',
			'directory_animes',
			'error',
			`Directory pages unavailable: ${failedPages.join(',')}`
		)
		return
	}

	await ctx.writer.markSyncState('feed', 'directory_animes', 'success')
}
