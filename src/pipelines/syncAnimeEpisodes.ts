import { fetchAnimeFlvHtml } from '../clients/animeflvClient'
import { config } from '../config'
import { extractEpisodeNumbers } from '../extractors/extractScriptValues'
import type { EpisodeDetail } from '../types/models'
import { runWithConcurrency } from '../utils/concurrency'
import type { PipelineContext } from './context'

export const syncAnimeEpisodes = async (ctx: PipelineContext, animeIds: string[]) => {
	const uniqueIds = Array.from(new Set(animeIds)).filter(Boolean)
	if (uniqueIds.length === 0) return

	await runWithConcurrency(uniqueIds, config.maxConcurrency, async (animeId) => {
		try {
			const html = await fetchAnimeFlvHtml(`/anime/${animeId}`)
			if (!html) {
				await ctx.writer.markSyncState('anime_episodes', animeId, 'error', 'Anime episode page unavailable')
				return
			}

			const episodeNumbers = await extractEpisodeNumbers(html)
			const episodes: EpisodeDetail[] = episodeNumbers.map((episodeNumber) => {
				const episodeId = `${animeId}-${episodeNumber}`
				return {
					episodeId,
					animeId,
					episode: episodeNumber,
					title: animeId.replaceAll('-', ' '),
					originalLink: `https://www3.animeflv.net/ver/${episodeId}`,
					image: null,
				}
			})

			await ctx.writer.upsertEpisodes(episodes)
			await ctx.writer.markSyncState('anime_episodes', animeId, 'success')
		} catch (error) {
			await ctx.writer.markSyncState('anime_episodes', animeId, 'error', String(error))
		}
	})
}
