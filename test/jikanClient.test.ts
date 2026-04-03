import { describe, expect, test } from 'bun:test'
import { JikanClient } from '../src/clients/jikanClient'

const createResponse = (status: number, payload: unknown) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' },
	})

describe('JikanClient', () => {
	test('searchAnime construye la query y retorna resultados', async () => {
		const requests: string[] = []
		const client = new JikanClient(
			{
				jikanBaseUrl: 'https://api.jikan.test/v4',
				requestTimeoutMs: 1000,
				requestRetryAttempts: 0,
			},
			async (input) => {
				requests.push(String(input))
				return createResponse(200, {
					data: [
						{
							mal_id: 52991,
							url: 'https://myanimelist.net/anime/52991/Sousou_no_Frieren',
							title: 'Sousou no Frieren',
							title_english: "Frieren: Beyond Journey's End",
							title_japanese: '葬送のフリーレン',
							titles: [{ type: 'Default', title: 'Sousou no Frieren' }],
							type: 'TV',
							year: 2023,
							episodes: 28,
							images: null,
						},
					],
				})
			}
		)

		const results = await client.searchAnime('Sousou no Frieren', 3)

		expect(requests).toEqual(['https://api.jikan.test/v4/anime?q=Sousou+no+Frieren&limit=3'])
		expect(results).toHaveLength(1)
		expect(results[0]?.mal_id).toBe(52991)
	})

	test('getAnimeFull retorna null si la API responde 404', async () => {
		const client = new JikanClient(
			{
				jikanBaseUrl: 'https://api.jikan.test/v4',
				requestTimeoutMs: 1000,
				requestRetryAttempts: 0,
			},
			async () => createResponse(404, { message: 'Not found' })
		)

		await expect(client.getAnimeFull(999999)).resolves.toBeNull()
	})

	test('getAnimeVideos reintenta errores transitorios y retorna null si se agotan', async () => {
		let attempts = 0
		const client = new JikanClient(
			{
				jikanBaseUrl: 'https://api.jikan.test/v4',
				requestTimeoutMs: 1000,
				requestRetryAttempts: 1,
			},
			async () => {
				attempts += 1
				return createResponse(429, { message: 'Too Many Requests' })
			}
		)

		await expect(client.getAnimeVideos(52991)).resolves.toBeNull()
		expect(attempts).toBe(2)
	})

	test('searchAnime retorna lista vacia cuando data viene null', async () => {
		const client = new JikanClient(
			{
				jikanBaseUrl: 'https://api.jikan.test/v4',
				requestTimeoutMs: 1000,
				requestRetryAttempts: 0,
			},
			async () => createResponse(200, { data: null })
		)

		await expect(client.searchAnime('Naruto')).resolves.toEqual([])
	})
})
