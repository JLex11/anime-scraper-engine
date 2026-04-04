import { extractEpisodeIds } from '../extractors/extractIds'
import type { EpisodeDetail } from '../types/models'
import { buildAnimeSeed } from '../utils/animeSeed'
import type { PipelineContext } from './context'
import { loadHomepage } from './pageAccess'

const parseEpisodeNumber = (episodeId: string) => {
	const match = episodeId.match(/-(\d+)$/)
	return Number(match?.[1] || 0)
}

const parseAnimeIdFromEpisode = (episodeId: string) => {
	const match = episodeId.match(/(.+)-\d+$/)
	return match?.[1] ?? episodeId
}

export const syncLatestEpisodes = async (ctx: PipelineContext) => {
	const html = await loadHomepage(ctx)
	if (!html) {
		ctx.logger.warn('syncLatestEpisodes: homepage unavailable')
		await ctx.writer.markSyncState('feed', 'latest_episodes', 'error', 'Homepage unavailable')
		return
	}

	const episodeIds = await extractEpisodeIds(html, 'ul.ListEpisodios li a')
	const topEpisodeIds = episodeIds.slice(0, 60)

	const episodes: EpisodeDetail[] = topEpisodeIds.map((episodeId) => {
		const animeId = parseAnimeIdFromEpisode(episodeId)
		const episode = parseEpisodeNumber(episodeId)

		return {
			episodeId,
			animeId,
			episode,
			title: animeId.replaceAll('-', ' '),
			originalLink: `https://www3.animeflv.net/ver/${episodeId}`,
			image: null,
		}
	})

	await ctx.writer.ensureAnimeRecords(episodes.map((episode) => buildAnimeSeed(episode.animeId, episode.title ?? episode.animeId)))
	await ctx.writer.upsertEpisodes(episodes)
	await ctx.writer.upsertEpisodeFeedItems('latest', topEpisodeIds)
	await ctx.writer.markSyncState('feed', 'latest_episodes', 'success')
}
