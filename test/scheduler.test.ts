import { describe, expect, test } from "bun:test";
import {
	formatSchedulerAggregateErrorMessage,
	getManualBatchManifest,
} from "../src/scheduler/shared";
import { getTaskNamesForCron } from "../src/scheduler/index";

describe("scheduler", () => {
	test("expone manifiesto estable de batches manuales", () => {
		expect(getManualBatchManifest()).toEqual([
			{
				batch: "feed-latest",
				tasks: ["sync-latest-animes", "sync-latest-episodes"],
			},
			{
				batch: "feed-secondary",
				tasks: ["sync-broadcast", "sync-top-rated", "sync-episode-sources"],
			},
			{
				batch: "directory-refresh",
				tasks: ["sync-directory"],
			},
			{
				batch: "detail-refresh",
				tasks: ["sync-details-and-episodes", "sync-anime-images"],
			},
		]);
	});

	test("resume nombres de tasks fallidas en el mensaje agregado", () => {
		expect(
			formatSchedulerAggregateErrorMessage([
				{
					taskName: "sync-broadcast",
					error: new Error("duplicate key"),
				},
				{
					taskName: "sync-top-rated",
					error: new Error("top rated failed"),
				},
			]),
		).toBe(
			"Scheduler tasks failed (2): sync-broadcast: duplicate key; sync-top-rated: top rated failed",
		);
	});

	test("mapea cada cron a la task esperada", () => {
		expect(getTaskNamesForCron("*/10 * * * *")).toEqual([
			"sync-latest-animes",
			"sync-latest-episodes",
		]);
		expect(getTaskNamesForCron("*/20 * * * *")).toEqual([
			"sync-broadcast",
			"sync-episode-sources",
		]);
		expect(getTaskNamesForCron("5 0,12 * * *")).toEqual([
			"sync-top-rated",
			"sync-directory",
		]);
		expect(getTaskNamesForCron("20 */4 * * *")).toEqual([
			"sync-details-and-episodes",
			"sync-anime-images",
		]);
		expect(getTaskNamesForCron("0 1 * * 1")).toEqual([]);
	});
});
