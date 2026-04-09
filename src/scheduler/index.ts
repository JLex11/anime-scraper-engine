import type { PipelineContext } from "../pipelines/context";
import { syncAnimeDetails } from "../pipelines/syncAnimeDetails";
import { syncAnimeEpisodes } from "../pipelines/syncAnimeEpisodes";
import { syncAnimeImages } from "../pipelines/syncAnimeImages";
import { syncBroadcast } from "../pipelines/syncBroadcast";
import { syncDirectoryAnimes } from "../pipelines/syncDirectoryAnimes";
import { syncEpisodeSources } from "../pipelines/syncEpisodeSources";
import { syncLatestAnimes } from "../pipelines/syncLatestAnimes";
import { syncLatestEpisodes } from "../pipelines/syncLatestEpisodes";
import { syncTopRated } from "../pipelines/syncTopRated";
import {
	formatSchedulerAggregateErrorMessage,
	getManualBatchManifest,
	getManualBatchTaskNames,
	MANUAL_BATCHES,
	type ManualBatchName,
	type TaskName,
} from "./shared";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAILY_DETAIL_LIMIT = 10;
const DAILY_IMAGE_LIMIT = 3;
const EPISODE_SOURCE_REFRESH_LIMIT = 12;

export const CRON_EVERY_15 = "*/15 * * * *";
export const CRON_EVERY_30 = "*/30 * * * *";
export const CRON_DAILY_DIRECTORY = "5 0 * * *";
export const CRON_DAILY_DETAILS = "20 */6 * * *";
export {
	formatSchedulerAggregateErrorMessage,
	getManualBatchManifest,
	getManualBatchTaskNames,
	MANUAL_BATCHES,
};
export type { ManualBatchName, TaskName } from "./shared";

type TaskSpec = {
	name: TaskName;
	intervalMs: number;
	run: () => Promise<void>;
};

type ScheduledTaskHandle = {
	cancel: () => void;
};

const buildTaskSpecs = (ctx: PipelineContext): TaskSpec[] => [
	{
		name: "sync-latest-animes",
		intervalMs: 15 * MINUTE,
		run: async () => syncLatestAnimes(ctx),
	},
	{
		name: "sync-latest-episodes",
		intervalMs: 15 * MINUTE,
		run: async () => syncLatestEpisodes(ctx),
	},
	{
		name: "sync-broadcast",
		intervalMs: 30 * MINUTE,
		run: async () => syncBroadcast(ctx),
	},
	{
		name: "sync-top-rated",
		intervalMs: 30 * MINUTE,
		run: async () => syncTopRated(ctx),
	},
	{
		name: "sync-directory",
		intervalMs: 24 * HOUR,
		run: async () => syncDirectoryAnimes(ctx, 5),
	},
	{
		name: "sync-details-and-episodes",
		intervalMs: 24 * HOUR,
		run: async () => {
			const animeIds = await ctx.writer.getAnimeIdsFromFeed(DAILY_DETAIL_LIMIT);
			await syncAnimeDetails(ctx, animeIds);
			await syncAnimeEpisodes(ctx, animeIds);
		},
	},
	{
		name: "sync-anime-images",
		intervalMs: 24 * HOUR,
		run: async () => {
			const animeIds = await ctx.writer.getAnimeIdsFromFeed(DAILY_IMAGE_LIMIT);
			await syncAnimeImages(ctx, animeIds);
		},
	},
	{
		name: "sync-episode-sources",
		intervalMs: 30 * MINUTE,
		run: async () => {
			const episodeIds = await ctx.writer.getEpisodeIdsNeedingSourceRefresh(
				EPISODE_SOURCE_REFRESH_LIMIT,
			);
			await syncEpisodeSources(ctx, episodeIds);
		},
	},
];

const runTask = async (ctx: PipelineContext, task: TaskSpec) => {
	const startedAt = Date.now();
	ctx.logger.info(`task.start ${task.name}`);

	try {
		await task.run();
		ctx.logger.info(`task.success ${task.name}`, {
			durationMs: Date.now() - startedAt,
		});
	} catch (error) {
		ctx.logger.error(`task.error ${task.name}`, {
			error: String(error),
			durationMs: Date.now() - startedAt,
		});
		throw error;
	}
};

const runTasksSequentially = async (
	ctx: PipelineContext,
	tasks: TaskSpec[],
	throwOnError = true,
) => {
	const failures: Array<{ taskName: TaskName; error: Error }> = [];

	for (const task of tasks) {
		try {
			await runTask(ctx, task);
		} catch (error) {
			failures.push({
				taskName: task.name,
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}
	}

	if (throwOnError && failures.length > 0) {
		const errors = failures.map(({ taskName, error }) => {
			const wrapped = new Error(`${taskName}: ${error.message}`);
			wrapped.name = error.name || "Error";
			return wrapped;
		});
		throw new AggregateError(
			errors,
			formatSchedulerAggregateErrorMessage(failures),
		);
	}
};

export const runTaskByName = async (
	ctx: PipelineContext,
	taskName: TaskName,
) => {
	const task = buildTaskSpecs(ctx).find((item) => item.name === taskName);
	if (!task) {
		throw new Error(`Task not found: ${taskName}`);
	}

	await runTask(ctx, task);
};

export const getTaskNamesForCron = (cronExpression: string): TaskName[] => {
	switch (cronExpression) {
		case CRON_EVERY_15:
			return ["sync-latest-animes", "sync-latest-episodes"];
		case CRON_EVERY_30:
			return ["sync-broadcast", "sync-top-rated", "sync-episode-sources"];
		case CRON_DAILY_DIRECTORY:
			return ["sync-directory"];
		case CRON_DAILY_DETAILS:
			return ["sync-details-and-episodes", "sync-anime-images"];
		default:
			return [];
	}
};

export const runCron = async (ctx: PipelineContext, cronExpression: string) => {
	const taskNames = getTaskNamesForCron(cronExpression);

	if (taskNames.length === 0) {
		ctx.logger.warn("No task registered for cron expression", {
			cronExpression,
		});
		return;
	}

	const tasks = buildTaskSpecs(ctx).filter((task) =>
		taskNames.includes(task.name),
	);
	await runTasksSequentially(ctx, tasks);
};

export const runManualBatch = async (
	ctx: PipelineContext,
	batchName: ManualBatchName,
) => {
	const taskNames = getManualBatchTaskNames(batchName);
	const tasks = buildTaskSpecs(ctx).filter((task) =>
		taskNames.includes(task.name),
	);
	await runTasksSequentially(ctx, tasks);
};

export const runScheduler = async (ctx: PipelineContext) => {
	const tasks = buildTaskSpecs(ctx);

	// Warm up all pipelines on startup so API has data quickly.
	await runTasksSequentially(ctx, tasks, false);

	const handles = tasks.map((task) => scheduleTaskLoop(ctx, task));

	const cancelAll = () => {
		for (const handle of handles) {
			handle.cancel();
		}
	};

	if (typeof process !== "undefined" && typeof process.once === "function") {
		process.once("SIGINT", cancelAll);
		process.once("SIGTERM", cancelAll);
	}
};

export const runOnce = async (ctx: PipelineContext) => {
	const tasks = buildTaskSpecs(ctx);
	await runTasksSequentially(ctx, tasks);
};

const scheduleTaskLoop = (
	ctx: PipelineContext,
	task: TaskSpec,
): ScheduledTaskHandle => {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let cancelled = false;

	const scheduleNext = () => {
		if (cancelled) return;
		timer = setTimeout(() => {
			void runCycle();
		}, task.intervalMs);
	};

	const runCycle = async () => {
		try {
			await runTask(ctx, task);
		} catch {
			// runTask already logs the failure; keep the loop alive.
		} finally {
			scheduleNext();
		}
	};

	scheduleNext();

	return {
		cancel: () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		},
	};
};
