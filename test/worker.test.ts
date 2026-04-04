import { beforeEach, describe, expect, mock, test } from 'bun:test'

const runOnceMock = mock(async () => {})
const runTaskByNameMock = mock(async () => {})
const syncAnimeDetailsMock = mock(async () => {})
const syncAnimeEpisodesMock = mock(async () => {})
const syncEpisodeSourcesMock = mock(async () => {})
const ensureAnimeRecordsMock = mock(async () => {})
const upsertEpisodesMock = mock(async () => {})

mock.module('../src/scheduler', () => ({
	runCron: async () => {},
	runOnce: runOnceMock,
	runTaskByName: runTaskByNameMock,
}))

mock.module('../src/pipelines/syncAnimeDetails', () => ({
	syncAnimeDetails: syncAnimeDetailsMock,
}))

mock.module('../src/pipelines/syncAnimeEpisodes', () => ({
	syncAnimeEpisodes: syncAnimeEpisodesMock,
}))

mock.module('../src/pipelines/syncEpisodeSources', () => ({
	syncEpisodeSources: syncEpisodeSourcesMock,
}))

mock.module('../src/runtime', () => ({
	createPipelineContext: () => ({
		config: { maxConcurrency: 4 },
		writer: {
			ensureAnimeRecords: ensureAnimeRecordsMock,
			upsertEpisodes: upsertEpisodesMock,
		},
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
		},
		jikanClient: {},
		fetchHtml: async () => null,
	}),
}))

const { default: worker } = await import('../src/worker')

describe('worker', () => {
	beforeEach(() => {
		runOnceMock.mockClear()
		runTaskByNameMock.mockClear()
		syncAnimeDetailsMock.mockClear()
		syncAnimeEpisodesMock.mockClear()
		syncEpisodeSourcesMock.mockClear()
		ensureAnimeRecordsMock.mockClear()
		upsertEpisodesMock.mockClear()
	})

	test('health responde ok', async () => {
		const response = await worker.fetch(new Request('https://example.test/health'), {})

		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toEqual({
			ok: true,
			service: 'anime-scraper-engine-worker',
		})
	})

	test('run-once rechaza requests sin token valido', async () => {
		const response = await worker.fetch(
			new Request('https://example.test/run-once', { method: 'POST' }),
			{
				SCRAPER_MANUAL_RUN_TOKEN: 'secret-token',
			}
		)

		expect(response.status).toBe(401)
		await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
		expect(runOnceMock).not.toHaveBeenCalled()
	})

	test('run-once ejecuta scheduler con bearer token valido', async () => {
		const response = await worker.fetch(
			new Request('https://example.test/run-once', {
				method: 'POST',
				headers: {
					authorization: 'Bearer secret-token',
				},
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: 'secret-token',
				SUPABASE_URL: 'https://supabase.test',
				SUPABASE_SERVICE_ROLE_KEY: 'service-role',
			}
		)

		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toEqual({ ok: true, mode: 'run-once' })
		expect(runOnceMock).toHaveBeenCalledTimes(1)
	})

	test('run-once puede ejecutar una tarea puntual via query param task', async () => {
		const response = await worker.fetch(
			new Request('https://example.test/run-once?task=sync-latest-animes', {
				method: 'POST',
				headers: {
					authorization: 'Bearer secret-token',
				},
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: 'secret-token',
				SUPABASE_URL: 'https://supabase.test',
				SUPABASE_SERVICE_ROLE_KEY: 'service-role',
			}
		)

		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: 'run-task',
			task: 'sync-latest-animes',
		})
		expect(runTaskByNameMock).toHaveBeenCalledTimes(1)
		expect(runOnceMock).not.toHaveBeenCalled()
	})

	test('scrape/anime ejecuta details y episodes para ids concretos', async () => {
		const response = await worker.fetch(
			new Request('https://example.test/scrape/anime', {
				method: 'POST',
				headers: {
					authorization: 'Bearer secret-token',
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					animeId: 'bleach',
					animeIds: ['naruto', 'bleach', 'naruto'],
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: 'secret-token',
			}
		)

		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: 'scrape-anime',
			animeIds: ['bleach', 'naruto'],
			includeDetails: true,
			includeEpisodes: true,
		})
		expect(ensureAnimeRecordsMock).toHaveBeenCalledTimes(1)
		expect(syncAnimeDetailsMock).toHaveBeenCalledTimes(1)
		const syncAnimeDetailsCall = syncAnimeDetailsMock.mock.calls[0] as unknown as [unknown, string[]]
		expect(syncAnimeDetailsCall[1]).toEqual(['bleach', 'naruto'])
		expect(syncAnimeEpisodesMock).toHaveBeenCalledTimes(1)
		const syncAnimeEpisodesCall = syncAnimeEpisodesMock.mock.calls[0] as unknown as [unknown, string[]]
		expect(syncAnimeEpisodesCall[1]).toEqual(['bleach', 'naruto'])
	})

	test('scrape/anime rechaza payload sin trabajo habilitado', async () => {
		const response = await worker.fetch(
			new Request('https://example.test/scrape/anime', {
				method: 'POST',
				headers: {
					authorization: 'Bearer secret-token',
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					animeId: 'bleach',
					includeDetails: false,
					includeEpisodes: false,
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: 'secret-token',
			}
		)

		expect(response.status).toBe(400)
		await expect(response.json()).resolves.toEqual({
			error: 'At least one of includeDetails or includeEpisodes must be true',
		})
		expect(syncAnimeDetailsMock).not.toHaveBeenCalled()
		expect(syncAnimeEpisodesMock).not.toHaveBeenCalled()
	})

	test('scrape/episode-sources asegura seed y scrapea fuentes para episodios concretos', async () => {
		const response = await worker.fetch(
			new Request('https://example.test/scrape/episode-sources', {
				method: 'POST',
				headers: {
					authorization: 'Bearer secret-token',
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					episodeId: 'bleach-7',
					episodeIds: ['naruto-shippuden-500'],
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: 'secret-token',
			}
		)

		expect(response.status).toBe(200)
		await expect(response.json()).resolves.toEqual({
			ok: true,
			mode: 'scrape-episode-sources',
			episodeIds: ['bleach-7', 'naruto-shippuden-500'],
		})
		expect(ensureAnimeRecordsMock).toHaveBeenCalledTimes(1)
		expect(upsertEpisodesMock).toHaveBeenCalledTimes(1)
		const upsertEpisodesCall = upsertEpisodesMock.mock.calls[0] as unknown as [unknown[]]
		expect(upsertEpisodesCall[0]).toEqual([
			{
				episodeId: 'bleach-7',
				animeId: 'bleach',
				episode: 7,
				title: 'bleach',
				originalLink: 'https://www3.animeflv.net/ver/bleach-7',
				image: null,
			},
			{
				episodeId: 'naruto-shippuden-500',
				animeId: 'naruto-shippuden',
				episode: 500,
				title: 'naruto shippuden',
				originalLink: 'https://www3.animeflv.net/ver/naruto-shippuden-500',
				image: null,
			},
		])
		expect(syncEpisodeSourcesMock).toHaveBeenCalledTimes(1)
		const syncEpisodeSourcesCall = syncEpisodeSourcesMock.mock.calls[0] as unknown as [unknown, string[]]
		expect(syncEpisodeSourcesCall[1]).toEqual(['bleach-7', 'naruto-shippuden-500'])
	})

	test('scrape/episode-sources rechaza episodeIds invalidos', async () => {
		const response = await worker.fetch(
			new Request('https://example.test/scrape/episode-sources', {
				method: 'POST',
				headers: {
					authorization: 'Bearer secret-token',
					'content-type': 'application/json',
				},
				body: JSON.stringify({
					episodeId: 'bleach-finale',
				}),
			}),
			{
				SCRAPER_MANUAL_RUN_TOKEN: 'secret-token',
			}
		)

		expect(response.status).toBe(400)
		await expect(response.json()).resolves.toEqual({
			error: 'Episode ids must end with a numeric suffix, for example naruto-12',
		})
		expect(upsertEpisodesMock).not.toHaveBeenCalled()
		expect(syncEpisodeSourcesMock).not.toHaveBeenCalled()
	})
})
