import { describe, expect, test } from "bun:test";
import {
	formatSchedulerAggregateErrorMessage,
	getManualBatchManifest,
} from "../src/scheduler/shared";

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
});
