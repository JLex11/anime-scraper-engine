export type TaskName =
	| "sync-latest-animes"
	| "sync-latest-episodes"
	| "sync-broadcast"
	| "sync-top-rated"
	| "sync-directory"
	| "sync-details-and-episodes"
	| "sync-anime-images"
	| "sync-episode-sources";

export const MANUAL_BATCHES = {
	"feed-latest": ["sync-latest-animes", "sync-latest-episodes"],
	"feed-secondary": [
		"sync-broadcast",
		"sync-top-rated",
		"sync-episode-sources",
	],
	"directory-refresh": ["sync-directory"],
	"detail-refresh": ["sync-details-and-episodes", "sync-anime-images"],
} as const satisfies Record<string, TaskName[]>;

export type ManualBatchName = keyof typeof MANUAL_BATCHES;

export const getManualBatchTaskNames = (batchName: ManualBatchName): TaskName[] =>
	[...MANUAL_BATCHES[batchName]];

export const getManualBatchManifest = () =>
	Object.entries(MANUAL_BATCHES).map(([batch, tasks]) => ({
		batch,
		tasks: [...tasks],
	}));

export const formatSchedulerAggregateErrorMessage = (
	failures: Array<{ taskName: TaskName; error: Error }>,
) => {
	const summary = failures
		.map(({ taskName, error }) => `${taskName}: ${error.message}`)
		.join("; ");

	return `Scheduler tasks failed (${failures.length}): ${summary}`;
};
