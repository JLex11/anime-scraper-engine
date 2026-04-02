import { fetchAnimeFlvHtml } from '../clients/animeflvClient'
import { config } from '../config'
import { extractEpisodeVideos } from '../extractors/extractScriptValues'
import { runWithConcurrency } from '../utils/concurrency'
import type { PipelineContext } from './context'

const addMinutes = (date: Date, minutes: number) => {
	return new Date(date.getTime() + minutes * 60_000)
}

export const syncEpisodeSources = async (ctx: PipelineContext, episodeIds: string[]) => {
	const uniqueIds = Array.from(new Set(episodeIds)).filter(Boolean)
	if (uniqueIds.length === 0) return

	await runWithConcurrency(uniqueIds, config.maxConcurrency, async (episodeId) => {
		try {
			const html = await fetchAnimeFlvHtml(`/ver/${episodeId}`)
			if (!html) {
				await ctx.writer.markSyncState('episode_sources', episodeId, 'error', 'Episode source page unavailable')
				return
			}

			const source = await extractEpisodeVideos(html)
			const now = new Date()

			await ctx.writer.upsertEpisodeSources({
				episodeId,
				episode: source.episode,
				videos: source.videos,
				scrapedAt: now.toISOString(),
				expiresAt: addMinutes(now, 30).toISOString(),
			})
			await ctx.writer.markSyncState('episode_sources', episodeId, 'success')
		} catch (error) {
			await ctx.writer.markSyncState('episode_sources', episodeId, 'error', String(error))
		}
	})
}
