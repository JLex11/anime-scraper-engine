import { syncBroadcast } from '../pipelines/syncBroadcast'
import { syncDirectoryAnimes } from '../pipelines/syncDirectoryAnimes'
import { syncEpisodeSources } from '../pipelines/syncEpisodeSources'
import { syncLatestAnimes } from '../pipelines/syncLatestAnimes'
import { syncLatestEpisodes } from '../pipelines/syncLatestEpisodes'
import { syncTopRated } from '../pipelines/syncTopRated'
import { syncAnimeDetails } from '../pipelines/syncAnimeDetails'
import { syncAnimeEpisodes } from '../pipelines/syncAnimeEpisodes'
import type { PipelineContext } from '../pipelines/context'

type Task = {
	name: string
	intervalMs: number
	run: () => Promise<void>
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const buildTasks = (ctx: PipelineContext): Task[] => [
	{
		name: 'sync-latest-animes',
		intervalMs: 15 * MINUTE,
		run: async () => syncLatestAnimes(ctx),
	},
	{
		name: 'sync-latest-episodes',
		intervalMs: 15 * MINUTE,
		run: async () => syncLatestEpisodes(ctx),
	},
	{
		name: 'sync-broadcast',
		intervalMs: 30 * MINUTE,
		run: async () => syncBroadcast(ctx),
	},
	{
		name: 'sync-top-rated',
		intervalMs: 30 * MINUTE,
		run: async () => syncTopRated(ctx),
	},
	{
		name: 'sync-directory',
		intervalMs: 24 * HOUR,
		run: async () => syncDirectoryAnimes(ctx, 5),
	},
	{
		name: 'sync-details-and-episodes',
		intervalMs: 24 * HOUR,
		run: async () => {
			const animeIds = await ctx.writer.getAnimeIdsFromFeed(250)
			await syncAnimeDetails(ctx, animeIds)
			await syncAnimeEpisodes(ctx, animeIds)
		},
	},
	{
		name: 'sync-episode-sources',
		intervalMs: 30 * MINUTE,
		run: async () => {
			const episodeIds = await ctx.writer.getRecentEpisodeIds(300)
			await syncEpisodeSources(ctx, episodeIds)
		},
	},
]

const runTask = async (ctx: PipelineContext, task: Task) => {
	const startedAt = Date.now()
	ctx.logger.info(`task.start ${task.name}`)

	try {
		await task.run()
		ctx.logger.info(`task.success ${task.name}`, { durationMs: Date.now() - startedAt })
	} catch (error) {
		ctx.logger.error(`task.error ${task.name}`, { error: String(error), durationMs: Date.now() - startedAt })
	}
}

export const runScheduler = async (ctx: PipelineContext) => {
	const tasks = buildTasks(ctx)

	// Warm up all pipelines on startup so API has data quickly.
	for (const task of tasks) {
		await runTask(ctx, task)
	}

	for (const task of tasks) {
		setInterval(() => {
			void runTask(ctx, task)
		}, task.intervalMs)
	}
}

export const runOnce = async (ctx: PipelineContext) => {
	const tasks = buildTasks(ctx)
	for (const task of tasks) {
		await runTask(ctx, task)
	}
}
