import { extractEpisodeNumbers } from '../extractors/extractScriptValues'
import type { EpisodeDetail } from '../types/models'
import { runWithConcurrency } from '../utils/concurrency'
import type { PipelineContext } from './context'
import { loadAnimePage } from './pageAccess'

export const syncAnimeEpisodes = async (ctx: PipelineContext, animeIds: string[]) => {
	const uniqueIds = Array.from(new Set(animeIds)).filter(Boolean)
	if (uniqueIds.length === 0) return

	const maxEpisodeByAnimeId = await ctx.writer.getMaxEpisodeNumbersByAnimeIds(uniqueIds)
	const episodeBatches: EpisodeDetail[][] = []

	const syncStates = (await runWithConcurrency(uniqueIds, ctx.config.maxConcurrency, async (animeId) => {
		try {
			const html = await loadAnimePage(ctx, animeId)
			if (!html) {
				return {
					resourceType: 'anime_episodes',
					resourceId: animeId,
					status: 'error',
					lastSuccessAt: null,
					lastErrorAt: new Date().toISOString(),
					errorCount: 1,
					errorMessage: 'Anime episode page unavailable',
				} as const
			}

			const episodeNumbers = await extractEpisodeNumbers(html)
			if (episodeNumbers.length === 0) {
				return {
					resourceType: 'anime_episodes',
					resourceId: animeId,
					status: 'error',
					lastSuccessAt: null,
					lastErrorAt: new Date().toISOString(),
					errorCount: 1,
					errorMessage: 'Could not parse anime episodes',
				} as const
			}
			const maxKnownEpisode = maxEpisodeByAnimeId.get(animeId) ?? 0
			const newEpisodeNumbers = episodeNumbers.filter((episodeNumber) => episodeNumber > maxKnownEpisode)

			if (newEpisodeNumbers.length === 0) {
				return {
					resourceType: 'anime_episodes',
					resourceId: animeId,
					status: 'success',
					lastSuccessAt: new Date().toISOString(),
					lastErrorAt: null,
					errorCount: 0,
					errorMessage: null,
				} as const
			}

			const episodes: EpisodeDetail[] = newEpisodeNumbers.map((episodeNumber) => {
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

			episodeBatches.push(episodes)
			return {
				resourceType: 'anime_episodes',
				resourceId: animeId,
				status: 'success',
				lastSuccessAt: new Date().toISOString(),
				lastErrorAt: null,
				errorCount: 0,
				errorMessage: null,
			} as const
		} catch (error) {
			return {
				resourceType: 'anime_episodes',
				resourceId: animeId,
				status: 'error',
				lastSuccessAt: null,
				lastErrorAt: new Date().toISOString(),
				errorCount: 1,
				errorMessage: String(error),
			} as const
		}
	})).filter(Boolean)

	const episodes = episodeBatches.flat()
	if (episodes.length > 0) {
		await ctx.writer.upsertEpisodes(episodes)
	}
	await ctx.writer.upsertSyncStates(syncStates)
}
