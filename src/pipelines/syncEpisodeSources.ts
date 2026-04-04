import { extractEpisodeVideos } from '../extractors/extractScriptValues'
import { runWithConcurrency } from '../utils/concurrency'
import type { EpisodeSourcesRecord, SyncStateUpsertInput } from '../types/models'
import type { PipelineContext } from './context'
import { loadEpisodePage } from './pageAccess'

const addMinutes = (date: Date, minutes: number) => {
	return new Date(date.getTime() + minutes * 60_000)
}

export const syncEpisodeSources = async (ctx: PipelineContext, episodeIds: string[]) => {
	const uniqueIds = Array.from(new Set(episodeIds)).filter(Boolean)
	if (uniqueIds.length === 0) return

	const records: EpisodeSourcesRecord[] = []
	const states = (await runWithConcurrency(uniqueIds, ctx.config.maxConcurrency, async (episodeId) => {
		try {
			const html = await loadEpisodePage(ctx, episodeId)
			if (!html) {
				return {
					resourceType: 'episode_sources',
					resourceId: episodeId,
					status: 'error',
					lastSuccessAt: null,
					lastErrorAt: new Date().toISOString(),
					errorCount: 1,
					errorMessage: 'Episode source page unavailable',
				} satisfies SyncStateUpsertInput
			}

			const source = await extractEpisodeVideos(html)
			const now = new Date()

			records.push({
				episodeId,
				episode: source.episode,
				videos: source.videos,
				scrapedAt: now.toISOString(),
				expiresAt: addMinutes(now, 30).toISOString(),
			})
			return {
				resourceType: 'episode_sources',
				resourceId: episodeId,
				status: 'success',
				lastSuccessAt: now.toISOString(),
				lastErrorAt: null,
				errorCount: 0,
				errorMessage: null,
			} satisfies SyncStateUpsertInput
		} catch (error) {
			return {
				resourceType: 'episode_sources',
				resourceId: episodeId,
				status: 'error',
				lastSuccessAt: null,
				lastErrorAt: new Date().toISOString(),
				errorCount: 1,
				errorMessage: String(error),
			} satisfies SyncStateUpsertInput
		}
	})).filter(Boolean)

	await ctx.writer.upsertEpisodeSourcesBatch(records)
	await ctx.writer.upsertSyncStates(states)
}
