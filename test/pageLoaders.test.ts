import { describe, expect, test } from 'bun:test'
import { createConfig } from '../src/config'
import { AnimeFlvPageLoader } from '../src/loaders/pageLoaders'
import type { RequestCoordinator } from '../src/http/requestCoordinator'

describe('AnimeFlvPageLoader', () => {
	test('separa las claves de cache por origen', async () => {
		const cacheKeys: string[] = []
		const coordinator = {
			requestText: async (
				_url: string,
				_init?: RequestInit,
				policy?: { cacheKey?: string },
			) => {
				if (policy?.cacheKey) cacheKeys.push(policy.cacheKey)
				return null
			},
		} as unknown as RequestCoordinator

		const newSiteLoader = new AnimeFlvPageLoader(
			createConfig({
				SUPABASE_URL: 'https://example.supabase.co',
				SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
				ANIMEFLV_BASE_URL: 'https://animeav1.com',
			}),
			coordinator,
		)
		const legacyLoader = new AnimeFlvPageLoader(
			createConfig({
				SUPABASE_URL: 'https://example.supabase.co',
				SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
				ANIMEFLV_BASE_URL: 'https://www3.animeflv.net',
			}),
			coordinator,
		)

		await newSiteLoader.getHomepage()
		await legacyLoader.getHomepage()

		expect(cacheKeys).toHaveLength(2)
		expect(cacheKeys[0]).not.toBe(cacheKeys[1])
	})
})
