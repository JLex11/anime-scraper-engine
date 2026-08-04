import { describe, expect, test } from 'bun:test'
import { createConfig } from '../src/config'
import { R2Writer } from '../src/writers/r2Writer'

const config = createConfig({
	SUPABASE_URL: 'https://example.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
	R2_BUCKET: 'anime-app',
})

describe('R2Writer', () => {
	test('rechaza URLs locales antes de hacer fetch', async () => {
		const previousFetch = globalThis.fetch
		let fetchCalls = 0
		globalThis.fetch = (async () => {
			fetchCalls += 1
			return new Response('should not be fetched')
		}) as unknown as typeof fetch

		try {
			const writer = new R2Writer(config, { put: async () => {} })
			const result = await writer.mirrorFromUrl('http://127.0.0.1/secret.jpg')
			expect(result.key).toBeNull()
			expect(fetchCalls).toBe(0)
		} finally {
			globalThis.fetch = previousFetch
		}
	})

	test('solo persiste respuestas declaradas como imagen', async () => {
		const previousFetch = globalThis.fetch
		let puts = 0
		globalThis.fetch = (async () =>
			new Response('<html>not an image</html>', {
				status: 200,
				headers: { 'content-type': 'text/html' },
			})) as unknown as typeof fetch

		try {
			const writer = new R2Writer(config, {
				put: async () => {
					puts += 1
				},
			})
			const result = await writer.mirrorFromUrl('https://cdn.animeav1.com/poster.jpg')
			expect(result.key).toBeNull()
			expect(puts).toBe(0)
		} finally {
			globalThis.fetch = previousFetch
		}
	})
})
