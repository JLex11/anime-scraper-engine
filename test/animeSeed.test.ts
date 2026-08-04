import { describe, expect, test } from 'bun:test'
import { isAnimeAv1BaseUrl } from '../src/utils/animeSeed'

describe('isAnimeAv1BaseUrl', () => {
	test('acepta el dominio y subdominios validos', () => {
		expect(isAnimeAv1BaseUrl('https://animeav1.com')).toBe(true)
		expect(isAnimeAv1BaseUrl('https://cdn.animeav1.com')).toBe(true)
	})

	test('rechaza dominios parecidos no autorizados', () => {
		expect(isAnimeAv1BaseUrl('https://evil-animeav1.com')).toBe(false)
		expect(isAnimeAv1BaseUrl('not-a-url')).toBe(false)
	})
})
