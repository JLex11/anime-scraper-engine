import { describe, expect, test } from 'bun:test'
import { app } from '../src/server'

describe('server', () => {
	test('protege el endpoint cron con el token manual', async () => {
		const previousToken = process.env.SCRAPER_MANUAL_RUN_TOKEN
		delete process.env.SCRAPER_MANUAL_RUN_TOKEN

		try {
			const response = await app.request('http://localhost/cron?cron=*/10%20*%20*%20*%20*', {
				method: 'POST',
			})
			expect(response.status).toBe(401)
		} finally {
			if (previousToken === undefined) delete process.env.SCRAPER_MANUAL_RUN_TOKEN
			else process.env.SCRAPER_MANUAL_RUN_TOKEN = previousToken
		}
	})
})
