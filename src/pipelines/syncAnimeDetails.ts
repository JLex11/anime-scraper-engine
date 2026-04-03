import { extractAnimeDetail } from '../extractors/extractAnimeDetail'
import { runWithConcurrency } from '../utils/concurrency'
import type { PipelineContext } from './context'

export const syncAnimeDetails = async (ctx: PipelineContext, animeIds: string[]) => {
	const uniqueIds = Array.from(new Set(animeIds)).filter(Boolean)
	if (uniqueIds.length === 0) return

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
		} catch (error) {
			await ctx.writer.markSyncState('anime_detail', animeId, 'error', String(error))
		}
	})
}
