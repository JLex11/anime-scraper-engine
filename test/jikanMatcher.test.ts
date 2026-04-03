import { describe, expect, test } from 'bun:test'
import type { JikanAnimeSearchResult } from '../src/clients/jikanClient'
import { createJikanSearchQueries, matchJikanAnime, normalizeAnimeType, normalizeTitle } from '../src/utils/jikanMatcher'

const createResult = (overrides?: Partial<JikanAnimeSearchResult>): JikanAnimeSearchResult => ({
	mal_id: 1,
	url: 'https://myanimelist.net/anime/1/Cowboy_Bebop',
	title: 'Cowboy Bebop',
	title_english: 'Cowboy Bebop',
	title_japanese: 'カウボーイビバップ',
	titles: [
		{ type: 'Default', title: 'Cowboy Bebop' },
		{ type: 'Japanese', title: 'カウボーイビバップ' },
	],
	type: 'TV',
	year: 1998,
	episodes: 26,
	images: null,
	...overrides,
})

describe('jikanMatcher', () => {
	test('normaliza titulos y tipos para comparar variantes', () => {
		expect(normalizeTitle('  Boku no Héro!!  ')).toBe('boku no hero')
		expect(normalizeAnimeType('Anime')).toBe('TV')
		expect(normalizeAnimeType('película')).toBe('Movie')
		expect(normalizeTitle('Kekkon Yubiwa Monogatari II')).toBe('kekkon yubiwa monogatari 2')
	})

	test('genera queries variantes para temporadas y numeros romanos', () => {
		expect(createJikanSearchQueries('Kekkon Yubiwa Monogatari II')).toContain('kekkon yubiwa monogatari 2')
		expect(createJikanSearchQueries('Fumetsu no Anata e Season 3')).toContain('Fumetsu no Anata e')
	})

	test('acepta match exacto por titulo principal', () => {
		const match = matchJikanAnime('Cowboy Bebop', 'TV', [createResult()])

		expect(match).not.toBeNull()
		expect(match?.result.mal_id).toBe(1)
		expect(match?.matchedTitle).toBe('Cowboy Bebop')
		expect(match?.score).toBe(1)
	})

	test('acepta match por titulo alterno con boost por tipo', () => {
		const match = matchJikanAnime(
			'Shingeki no Kyojin',
			'TV',
			[
				createResult({
					mal_id: 16498,
					title: 'Attack on Titan',
					title_english: 'Attack on Titan',
					title_japanese: 'Shingeki no Kyojin',
					titles: [
						{ type: 'Default', title: 'Attack on Titan' },
						{ type: 'Japanese', title: 'Shingeki no Kyojin' },
					],
				}),
			]
		)

		expect(match).not.toBeNull()
		expect(match?.result.mal_id).toBe(16498)
		expect(match?.matchedTitle).toBe('Shingeki no Kyojin')
		expect(match?.typeMatched).toBe(true)
	})

	test('rechaza candidatos con baja confianza', () => {
		const match = matchJikanAnime('Cowboy Bebop', 'TV', [
			createResult({
				mal_id: 200,
				title: 'Completely Different Show',
				title_english: 'Another Series',
				title_japanese: 'Betsu no Anime',
				titles: [{ type: 'Default', title: 'Completely Different Show' }],
			}),
		])

		expect(match).toBeNull()
	})

	test('desempata usando el mejor score entre candidatos parecidos', () => {
		const match = matchJikanAnime('Fullmetal Alchemist Brotherhood', 'TV', [
			createResult({
				mal_id: 5114,
				title: 'Fullmetal Alchemist: Brotherhood',
				title_english: 'Fullmetal Alchemist: Brotherhood',
				titles: [{ type: 'Default', title: 'Fullmetal Alchemist: Brotherhood' }],
			}),
			createResult({
				mal_id: 121,
				title: 'Fullmetal Alchemist',
				title_english: 'Fullmetal Alchemist',
				titles: [{ type: 'Default', title: 'Fullmetal Alchemist' }],
			}),
		])

		expect(match).not.toBeNull()
		expect(match?.result.mal_id).toBe(5114)
	})
})
