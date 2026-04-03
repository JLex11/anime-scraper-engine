import { beforeEach, describe, expect, mock, test } from 'bun:test'

const runOnceMock = mock(async () => {})

mock.module('../src/scheduler', () => ({
	runCron: async () => {},
	runOnce: runOnceMock,
}))

const { default: worker } = await import('../src/worker')

describe('worker', () => {
	beforeEach(() => {
		runOnceMock.mockClear()
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
})
