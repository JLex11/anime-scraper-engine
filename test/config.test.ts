import { describe, expect, test } from 'bun:test'
import { createConfig } from '../src/config'

const validEnv = {
	SUPABASE_URL: 'https://example.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}

describe('createConfig', () => {
	test('usa AnimeAV1 y valores numericos seguros por defecto', () => {
		const config = createConfig(validEnv)

		expect(config.animeFlvBaseUrl).toBe('https://animeav1.com')
		expect(config.requestTimeoutMs).toBe(15000)
		expect(config.requestRetryAttempts).toBe(1)
		expect(config.maxConcurrency).toBe(6)
		expect(config.embeddedSchedulerEnabled).toBe(true)
	})

	test('permite desactivar explicitamente el scheduler para Workers', () => {
		const config = createConfig({
			...validEnv,
			SCRAPER_ENABLE_EMBEDDED_SCHEDULER: 'false',
		})

		expect(config.embeddedSchedulerEnabled).toBe(false)
	})

	test('rechaza valores numericos fuera de rango', () => {
		expect(() => createConfig({ ...validEnv, SCRAPER_MAX_CONCURRENCY: '0' })).toThrow(
			'SCRAPER_MAX_CONCURRENCY',
		)
		expect(() => createConfig({ ...validEnv, SCRAPER_REQUEST_TIMEOUT_MS: 'nope' })).toThrow(
			'SCRAPER_REQUEST_TIMEOUT_MS',
		)
	})
})
