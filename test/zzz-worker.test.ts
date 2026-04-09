import { beforeEach, describe, expect, mock, test } from "bun:test";

const runOnceMock = mock(async () => {});
const runTaskByNameMock = mock(async () => {});
const runManualBatchMock = mock(async () => {});
const getManualBatchTaskNamesMock = mock(
	(batch: string) =>
		(
			{
				"feed-latest": ["sync-latest-animes", "sync-latest-episodes"],
				"feed-secondary": [
					"sync-broadcast",
					"sync-top-rated",
					"sync-episode-sources",
				],
				"directory-refresh": ["sync-directory"],
				"detail-refresh": ["sync-details-and-episodes", "sync-anime-images"],
			} as Record<string, string[]>
		)[batch] ?? [],
);
const manualBatchManifest = [
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
] as const;
const getManualBatchManifestMock = mock(() => manualBatchManifest);
const syncEpisodeSourcesMock = mock(async () => {});
const ensureAnimeRecordsMock = mock(async () => {});
const upsertEpisodesMock = mock(async () => {});

mock.module("../src/scheduler", () => ({
	runCron: async () => {},
	runOnce: runOnceMock,
	runTaskByName: runTaskByNameMock,
	runManualBatch: runManualBatchMock,
	getManualBatchTaskNames: getManualBatchTaskNamesMock,
	getManualBatchManifest: getManualBatchManifestMock,
}));

mock.module("../src/pipelines/syncEpisodeSources", () => ({
	syncEpisodeSources: syncEpisodeSourcesMock,
}));

mock.module("../src/runtime", () => ({
	createPipelineContext: () => ({
		config: { maxConcurrency: 4 },
		writer: {
			ensureAnimeRecords: ensureAnimeRecordsMock,
			upsertEpisodes: upsertEpisodesMock,
			upsertSyncStates: async () => {},
			getMaxEpisodeNumberByAnimeId: async () => 0,
			getMaxEpisodeNumbersByAnimeIds: async (animeIds: string[]) =>
				new Map(animeIds.map((animeId) => [animeId, 0])),
			markSyncState: async () => {},
		},
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		jikanClient: {},
		fetchHtml: async () => `
			<script>
				const episodes = [[1, "uno"]];
			</script>
		`,
	}),
}));

const { default: worker } = await import("../src/worker");
mock.restore();

describe("worker", () => {
	beforeEach(() => {
		runOnceMock.mockClear();
		runTaskByNameMock.mockClear();
		runManualBatchMock.mockClear();
		getManualBatchTaskNamesMock.mockClear();
		getManualBatchManifestMock.mockClear();
		syncEpisodeSourcesMock.mockClear();
		ensureAnimeRecordsMock.mockClear();
		upsertEpisodesMock.mockClear();
	});

	test("health responde ok", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/health"),
			{},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			service: "anime-scraper-engine-worker",
		});
	});

	test("run-once rechaza requests sin token valido", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/run-once", { method: "POST" }),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
			},
		);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
		expect(runOnceMock).not.toHaveBeenCalled();
	});

	test("run-once sin params devuelve manifiesto de batches", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/run-once", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
				},
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
				SUPABASE_URL: "https://supabase.test",
				SUPABASE_SERVICE_ROLE_KEY: "service-role",
			},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: "run-plan",
			batches: manualBatchManifest,
		});
		expect(getManualBatchManifestMock).toHaveBeenCalledTimes(1);
		expect(runOnceMock).not.toHaveBeenCalled();
	});

	test("run-once puede ejecutar un batch explicito", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/run-once?batch=feed-secondary", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
				},
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
				SUPABASE_URL: "https://supabase.test",
				SUPABASE_SERVICE_ROLE_KEY: "service-role",
			},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: "run-batch",
			batch: "feed-secondary",
			tasks: ["sync-broadcast", "sync-top-rated", "sync-episode-sources"],
		});
		expect(runManualBatchMock).toHaveBeenCalledTimes(1);
		expect(runManualBatchMock).toHaveBeenCalledWith(
			expect.anything(),
			"feed-secondary",
		);
		expect(runOnceMock).not.toHaveBeenCalled();
	});

	test("run-once rechaza task y batch al mismo tiempo", async () => {
		const response = await worker.fetch(
			new Request(
				"https://example.test/run-once?task=sync-latest-animes&batch=feed-latest",
				{
					method: "POST",
					headers: {
						authorization: "Bearer secret-token",
					},
				},
			),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
				SUPABASE_URL: "https://supabase.test",
				SUPABASE_SERVICE_ROLE_KEY: "service-role",
			},
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Provide only one of task or batch",
		});
		expect(runTaskByNameMock).not.toHaveBeenCalled();
		expect(runManualBatchMock).not.toHaveBeenCalled();
		expect(runOnceMock).not.toHaveBeenCalled();
	});

	test("run-once puede ejecutar una tarea puntual via query param task", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/run-once?task=sync-latest-animes", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
				},
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
				SUPABASE_URL: "https://supabase.test",
				SUPABASE_SERVICE_ROLE_KEY: "service-role",
			},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: "run-task",
			task: "sync-latest-animes",
		});
		expect(runTaskByNameMock).toHaveBeenCalledTimes(1);
		expect(runOnceMock).not.toHaveBeenCalled();
	});

	test("run-once acepta la nueva tarea sync-anime-images", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/run-once?task=sync-anime-images", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
				},
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
				SUPABASE_URL: "https://supabase.test",
				SUPABASE_SERVICE_ROLE_KEY: "service-role",
			},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: "run-task",
			task: "sync-anime-images",
		});
		expect(runTaskByNameMock).toHaveBeenCalledTimes(1);
		expect(runOnceMock).not.toHaveBeenCalled();
	});

	test("scrape/anime ejecuta episodes para ids concretos", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/scrape/anime", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					animeId: "bleach",
					animeIds: ["naruto", "bleach", "naruto"],
					includeDetails: false,
					includeEpisodes: true,
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
			},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: "scrape-anime",
			animeIds: ["bleach", "naruto"],
			includeDetails: false,
			includeEpisodes: true,
		});
		expect(ensureAnimeRecordsMock).toHaveBeenCalledTimes(1);
		expect(upsertEpisodesMock).toHaveBeenCalled();
		const allEpisodes = upsertEpisodesMock.mock.calls.flatMap((call) => {
			const payload = (call as unknown[])[0];
			return Array.isArray(payload)
				? (payload as Array<Record<string, unknown>>)
				: [];
		});
		expect(allEpisodes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					episodeId: "bleach-1",
					animeId: "bleach",
				}),
				expect.objectContaining({
					episodeId: "naruto-1",
					animeId: "naruto",
				}),
			]),
		);
	});

	test("scrape/anime rechaza payload sin trabajo habilitado", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/scrape/anime", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					animeId: "bleach",
					includeDetails: false,
					includeEpisodes: false,
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
			},
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "At least one of includeDetails or includeEpisodes must be true",
		});
		expect(upsertEpisodesMock).not.toHaveBeenCalled();
	});

	test("scrape/episode-sources asegura seed y scrapea fuentes para episodios concretos", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/scrape/episode-sources", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					episodeId: "bleach-7",
					episodeIds: ["naruto-shippuden-500"],
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
			},
		);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: "scrape-episode-sources",
			episodeIds: ["bleach-7", "naruto-shippuden-500"],
		});
		expect(ensureAnimeRecordsMock).toHaveBeenCalledTimes(1);
		expect(upsertEpisodesMock).toHaveBeenCalledTimes(1);
		const upsertEpisodesCall = upsertEpisodesMock.mock.calls[0] as unknown as [
			unknown[],
		];
		expect(upsertEpisodesCall[0]).toEqual([
			{
				episodeId: "bleach-7",
				animeId: "bleach",
				episode: 7,
				title: "bleach",
				originalLink: "https://www3.animeflv.net/ver/bleach-7",
				image: null,
			},
			{
				episodeId: "naruto-shippuden-500",
				animeId: "naruto-shippuden",
				episode: 500,
				title: "naruto shippuden",
				originalLink: "https://www3.animeflv.net/ver/naruto-shippuden-500",
				image: null,
			},
		]);
		expect(syncEpisodeSourcesMock).toHaveBeenCalledTimes(1);
		const syncEpisodeSourcesCall = syncEpisodeSourcesMock.mock
			.calls[0] as unknown as [unknown, string[]];
		expect(syncEpisodeSourcesCall[1]).toEqual([
			"bleach-7",
			"naruto-shippuden-500",
		]);
	});

	test("scrape/episode-sources rechaza episodeIds invalidos", async () => {
		const response = await worker.fetch(
			new Request("https://example.test/scrape/episode-sources", {
				method: "POST",
				headers: {
					authorization: "Bearer secret-token",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					episodeId: "bleach-finale",
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: "secret-token",
			},
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error:
				"Episode ids must end with a numeric suffix, for example naruto-12",
		});
		expect(upsertEpisodesMock).not.toHaveBeenCalled();
		expect(syncEpisodeSourcesMock).not.toHaveBeenCalled();
	});
});
