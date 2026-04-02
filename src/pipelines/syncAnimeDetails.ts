import { fetchAnimeFlvHtml } from '../clients/animeflvClient'
import { config } from '../config'
import { extractAnimeDetail } from '../extractors/extractAnimeDetail'
import { runWithConcurrency } from '../utils/concurrency'
import type { PipelineContext } from './context'

export const syncAnimeDetails = async (ctx: PipelineContext, animeIds: string[]) => {
	const uniqueIds = Array.from(new Set(animeIds)).filter(Boolean)
	if (uniqueIds.length === 0) return

	await runWithConcurrency(uniqueIds, config.maxConcurrency, async (animeId) => {
		try {
			const html = await fetchAnimeFlvHtml(`/anime/${animeId}`)
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
				const mirrored = await ctx.r2Writer.mirrorFromUrl(detail.images.coverImage, `animes/${animeId}`)
				detail.images.coverImage = mirrored.url
				detail.coverImageKey = mirrored.key
			}

			await ctx.writer.upsertAnimeDetails(detail)
			await ctx.writer.markSyncState('anime_detail', animeId, 'success')
		} catch (error) {
			await ctx.writer.markSyncState('anime_detail', animeId, 'error', String(error))
		}
	})
}
