import { describe, expect, test } from 'bun:test'
import type { JikanAnimeFull, JikanAnimeSearchResult, JikanAnimeVideos } from '../src/clients/jikanClient'
import { syncAnimeDetails } from '../src/pipelines/syncAnimeDetails'
import { createLoggerSpy, createPipelineContext, createWriterSpy } from './pipelineTestUtils'
import { loadFixture } from './helpers/loadFixture'

const createJikanClientSpy = (options?: {
	searchResults?: JikanAnimeSearchResult[]
	full?: JikanAnimeFull | null
	videos?: JikanAnimeVideos | null
}) => {
	const calls = {
		searches: [] as string[],
		full: [] as number[],
		videos: [] as number[],
	}

	return {
		calls,
		client: {
			searchAnime: async (query: string) => {
				calls.searches.push(query)
				return options?.searchResults ?? []
			},
			getAnimeFull: async (malId: number) => {
				calls.full.push(malId)
				return options?.full ?? null
			},
			getAnimeVideos: async (malId: number) => {
				calls.videos.push(malId)
				return options?.videos ?? null
			},
		},
	}
}

const createSearchResult = (overrides?: Partial<JikanAnimeSearchResult>): JikanAnimeSearchResult => ({
	mal_id: 1923,
	url: 'https://myanimelist.net/anime/1923/Attack_on_Titan',
	title: 'Attack on Titan',
	title_english: 'Attack on Titan',
	title_japanese: 'Shingeki no Kyojin',
	titles: [
		{ type: 'Default', title: 'Attack on Titan' },
		{ type: 'Japanese', title: 'Shingeki no Kyojin' },
	],
	type: 'TV',
	year: 2013,
	episodes: 25,
	images: {
		jpg: {
			image_url: 'https://cdn.mal.example/aot.jpg',
			small_image_url: 'https://cdn.mal.example/aot-small.jpg',
			large_image_url: 'https://cdn.mal.example/aot-large.jpg',
		},
	},
	...overrides,
})

const createFullResult = (overrides?: Partial<JikanAnimeFull>): JikanAnimeFull => ({
	mal_id: 1923,
	url: 'https://myanimelist.net/anime/1923/Attack_on_Titan',
	title: 'Attack on Titan',
	title_english: 'Attack on Titan',
	title_japanese: 'Shingeki no Kyojin',
	titles: [
		{ type: 'Default', title: 'Attack on Titan' },
		{ type: 'Japanese', title: 'Shingeki no Kyojin' },
	],
	synopsis: 'Humanity fights titans.',
	background: 'Background text',
	type: 'TV',
	status: 'Finished Airing',
	rating: 'R - 17+',
	source: 'Manga',
	season: 'spring',
	year: 2013,
	episodes: 25,
	duration: '24 min per ep',
	score: 8.9,
	scored_by: 100000,
	rank: 12,
	popularity: 1,
	members: 2000000,
	favorites: 120000,
	images: {
		jpg: {
			image_url: 'https://cdn.mal.example/aot.jpg',
			small_image_url: 'https://cdn.mal.example/aot-small.jpg',
			large_image_url: 'https://cdn.mal.example/aot-large.jpg',
		},
	},
	trailer: {
		youtube_id: 'abc123',
		url: 'https://youtube.com/watch?v=abc123',
		embed_url: 'https://www.youtube-nocookie.com/embed/abc123',
		images: {
			image_url: 'https://img.youtube.com/abc123/default.jpg',
		},
	},
	genres: [{ mal_id: 1, type: 'anime', name: 'Action', url: 'https://myanimelist.net/anime/genre/1/Action' }],
	studios: [{ mal_id: 4, type: 'anime', name: 'Wit Studio', url: 'https://myanimelist.net/anime/producer/4/Wit_Studio' }],
	external: [{ name: 'Official Site', url: 'https://shingeki.tv/' }],
	streaming: [{ name: 'Crunchyroll', url: 'https://crunchyroll.com/attack-on-titan' }],
	relations: [
		{
			relation: 'Sequel',
			entry: [
				{
					mal_id: 25777,
					type: 'anime',
					name: 'Shingeki no Kyojin Season 2',
					url: 'https://myanimelist.net/anime/25777/Shingeki_no_Kyojin_Season_2',
				},
			],
		},
	],
	...overrides,
})

const createVideosResult = (overrides?: Partial<JikanAnimeVideos>): JikanAnimeVideos => ({
	promo: [
		{
			title: 'PV 1',
			trailer: {
				youtube_id: 'promo123',
				url: 'https://youtube.com/watch?v=promo123',
				embed_url: 'https://www.youtube-nocookie.com/embed/promo123',
				images: {
					image_url: 'https://img.youtube.com/promo123/default.jpg',
				},
			},
		},
	],
	...overrides,
})

describe('syncAnimeDetails', () => {
	test('scrapea detalles unicos, refleja portada a R2 y persiste enrichment Jikan', async () => {
		const animeHtml = await loadFixture('animeflv/anime.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru.html')
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const mirroredUrls: string[] = []
		const fetchedPaths: string[] = []
		const jikanSpy = createJikanClientSpy({
			searchResults: [
				createSearchResult({
					mal_id: 64154,
					title: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
					title_english: 'Monster Eater',
					title_japanese: '魔物喰らいの冒険者 ~俺だけ魔物を喰らって強くなる~',
				}),
			],
			full: createFullResult({
				mal_id: 64154,
				url: 'https://myanimelist.net/anime/64154/Mamonogurai_no_Boukensha',
				title: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
				title_english: 'Monster Eater',
				title_japanese: '魔物喰らいの冒険者 ~俺だけ魔物を喰らって強くなる~',
			}),
			videos: createVideosResult(),
		})

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			jikanClient: jikanSpy.client as ReturnType<typeof createPipelineContext>['jikanClient'],
			fetchHtml: async (path) => {
				fetchedPaths.push(path)
				return animeHtml
			},
			r2Writer: {
				isEnabled: () => true,
				mirrorFromUrl: async (url: string, prefix: string) => {
					mirroredUrls.push(`${prefix}:${url}`)
					return {
						url: 'https://r2.example/animes/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru/4343.jpg',
						key: 'animes/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru/4343.jpg',
					}
				},
			} as NonNullable<ReturnType<typeof createPipelineContext>['r2Writer']>,
		})

		await syncAnimeDetails(ctx, [
			'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
			'',
			'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
		])

		expect(fetchedPaths).toEqual(['/anime/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru'])
		expect(mirroredUrls).toEqual([
			'animes/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru:/uploads/animes/covers/4343.jpg',
		])
		expect(jikanSpy.calls.searches).toEqual(['Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru'])
		expect(jikanSpy.calls.full).toEqual([64154])
		expect(jikanSpy.calls.videos).toEqual([64154])
		expect(writerSpy.animeDetails).toHaveLength(1)
			expect(writerSpy.animeDetails[0]).toMatchObject({
				animeId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
				title: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
				otherTitles: ['魔物喰らいの冒険者 ~俺だけ魔物を喰らって強くなる~', 'Monster Eater'],
				type: 'TV',
				status: 'En emision',
				coverImageKey: 'animes/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru/4343.jpg',
				images: {
					coverImage: '/uploads/animes/covers/4343.jpg',
					carouselImages: [],
				},
			})
		expect(writerSpy.animeJikanDetails).toHaveLength(1)
		expect(writerSpy.animeJikanDetails[0]).toMatchObject({
			animeId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
			malId: 64154,
			matchedQuery: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
			matchedTitle: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
			promos: [{ title: 'PV 1' }],
		})
		const fetchedAt = new Date(writerSpy.animeJikanDetails[0].jikanFetchedAt).getTime()
		const expiresAt = new Date(writerSpy.animeJikanDetails[0].jikanExpiresAt).getTime()
		expect(expiresAt - fetchedAt).toBe(7 * 24 * 60 * 60 * 1000)
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
				resourceId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
				status: 'success',
				errorMessage: undefined,
			},
			{
				resourceType: 'anime_jikan_detail',
				resourceId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
				status: 'success',
				errorMessage: undefined,
			},
		])
		expect(loggerSpy.warns).toHaveLength(0)
	})

	test('marca error cuando no puede parsear el detalle', async () => {
		const writerSpy = createWriterSpy()

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			fetchHtml: async () => '<div>sin titulo</div>',
		})

		await syncAnimeDetails(ctx, ['monster'])

		expect(writerSpy.animeDetails).toHaveLength(0)
		expect(writerSpy.animeJikanDetails).toHaveLength(0)
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
				resourceId: 'monster',
				status: 'error',
				errorMessage: 'Could not parse anime detail',
			},
		])
	})

	test('si el enrichment Jikan sigue vigente, no vuelve a consultar la API', async () => {
		const writerSpy = createWriterSpy()
		const jikanSpy = createJikanClientSpy()
		writerSpy.writer.getAnimeJikanRefreshMetas = async () =>
			new Map([
				[
					'attack-on-titan',
					{
						malId: 1923,
						jikanExpiresAt: '2099-01-01T00:00:00.000Z',
					},
				],
			])

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			jikanClient: jikanSpy.client as ReturnType<typeof createPipelineContext>['jikanClient'],
			fetchHtml: async () => `
				<div class="Ficha">
					<h1> Attack on Titan </h1>
					<span class="Type tv">Anime</span>
				</div>
				<div class="AnimeCover"><img src="https://cdn.example/aot.webp" /></div>
			`,
		})

		await syncAnimeDetails(ctx, ['attack-on-titan'])

		expect(jikanSpy.calls.searches).toEqual([])
		expect(jikanSpy.calls.full).toEqual([])
		expect(jikanSpy.calls.videos).toEqual([])
		expect(writerSpy.animeJikanDetails).toHaveLength(0)
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
				resourceId: 'attack-on-titan',
				status: 'success',
				errorMessage: undefined,
			},
			{
				resourceType: 'anime_jikan_detail',
				resourceId: 'attack-on-titan',
				status: 'success',
				errorMessage: undefined,
			},
		])
	})

	test('si el enrichment expiro y ya existe malId, refresca desde Jikan sin buscar de nuevo', async () => {
		const writerSpy = createWriterSpy()
		const jikanSpy = createJikanClientSpy({
			full: createFullResult(),
			videos: createVideosResult(),
		})
		writerSpy.writer.getAnimeJikanRefreshMetas = async () =>
			new Map([
				[
					'attack-on-titan',
					{
						malId: 1923,
						jikanExpiresAt: '2020-01-01T00:00:00.000Z',
					},
				],
			])

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			jikanClient: jikanSpy.client as ReturnType<typeof createPipelineContext>['jikanClient'],
			fetchHtml: async () => `
				<div class="Ficha">
					<h1> Attack on Titan </h1>
					<span class="Type tv">Anime</span>
				</div>
				<div class="AnimeCover"><img src="https://cdn.example/aot.webp" /></div>
			`,
		})

		await syncAnimeDetails(ctx, ['attack-on-titan'])

		expect(jikanSpy.calls.searches).toEqual([])
		expect(jikanSpy.calls.full).toEqual([1923])
		expect(jikanSpy.calls.videos).toEqual([1923])
		expect(writerSpy.animeJikanDetails).toHaveLength(1)
		expect(writerSpy.animeJikanDetails[0].matchScore).toBe(1)
	})

	test('marca error de jikan si no encuentra un match confiable sin romper anime_detail', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const jikanSpy = createJikanClientSpy({
			searchResults: [
				createSearchResult({
					mal_id: 9999,
					title: 'Completely Different Title',
					title_english: 'Another Show',
					title_japanese: 'Betsu no Anime',
					titles: [{ type: 'Default', title: 'Completely Different Title' }],
				}),
			],
		})

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			jikanClient: jikanSpy.client as ReturnType<typeof createPipelineContext>['jikanClient'],
			fetchHtml: async () => `
				<div class="Ficha">
					<h1> Attack on Titan </h1>
					<span class="Type tv">Anime</span>
				</div>
				<div class="AnimeCover"><img src="https://cdn.example/aot.webp" /></div>
			`,
		})

		await syncAnimeDetails(ctx, ['attack-on-titan'])

		expect(writerSpy.animeDetails).toHaveLength(1)
		expect(writerSpy.animeJikanDetails).toHaveLength(0)
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
				resourceId: 'attack-on-titan',
				status: 'success',
				errorMessage: undefined,
			},
			{
				resourceType: 'anime_jikan_detail',
				resourceId: 'attack-on-titan',
				status: 'error',
				errorMessage: 'No confident Jikan match',
			},
		])
		expect(loggerSpy.warns).toEqual([
			{
				message: 'syncAnimeDetails: no confident Jikan match',
				meta: {
					animeId: 'attack-on-titan',
					title: 'Attack on Titan',
					otherTitles: [],
					type: 'TV',
					resultCount: 1,
					attemptedSearches: [
						{
							lookupTitle: 'Attack on Titan',
							query: 'Attack on Titan',
							resultCount: 1,
						},
						{
							lookupTitle: 'Attack on Titan',
							query: 'attack on titan',
							resultCount: 1,
						},
					],
				},
			},
		])
	})

	test('usa titulos alternativos de AnimeFLV para buscar en Jikan', async () => {
		const writerSpy = createWriterSpy()
		const jikanSpy = createJikanClientSpy({
			searchResults: [
				createSearchResult({
					mal_id: 64154,
					title: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
					title_english: 'Monster Eater',
					title_japanese: '魔物喰らいの冒険者 ~俺だけ魔物を喰らって強くなる~',
				}),
			],
			full: createFullResult({
				mal_id: 64154,
				title: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
				title_english: 'Monster Eater',
				title_japanese: '魔物喰らいの冒険者 ~俺だけ魔物を喰らって強くなる~',
			}),
			videos: createVideosResult(),
		})

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			jikanClient: {
				searchAnime: async (query: string) => {
					jikanSpy.calls.searches.push(query)
					return query === 'Monster Eater' ? jikanSpy.client.searchAnime(query) : []
				},
				getAnimeFull: jikanSpy.client.getAnimeFull,
				getAnimeVideos: jikanSpy.client.getAnimeVideos,
			} as ReturnType<typeof createPipelineContext>['jikanClient'],
			fetchHtml: async () => `
				<div class="Ficha">
					<h1> Unknown Source Title </h1>
					<span class="Type tv">Anime</span>
					<div>
						<span class="TxtAlt">Monster Eater</span>
					</div>
				</div>
				<div class="AnimeCover"><img src="https://cdn.example/unknown.webp" /></div>
			`,
		})

		await syncAnimeDetails(ctx, ['unknown-source-title'])

		expect(jikanSpy.calls.searches).toContain('Unknown Source Title')
		expect(jikanSpy.calls.searches).toContain('Monster Eater')
		expect(writerSpy.animeJikanDetails).toHaveLength(1)
		expect(writerSpy.animeJikanDetails[0]?.malId).toBe(64154)
	})

	test('si Jikan falla, persiste el detalle base y marca error separado', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const jikanSpy = createJikanClientSpy({
			searchResults: [createSearchResult()],
			full: createFullResult(),
			videos: null,
		})

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			jikanClient: jikanSpy.client as ReturnType<typeof createPipelineContext>['jikanClient'],
			fetchHtml: async () => `
				<div class="Ficha">
					<h1> Attack on Titan </h1>
					<span class="Type tv">Anime</span>
				</div>
				<div class="AnimeCover"><img src="https://cdn.example/aot.webp" /></div>
			`,
			r2Writer: {
				isEnabled: () => true,
				mirrorFromUrl: async () => {
					throw new Error('r2 down')
				},
			} as unknown as NonNullable<ReturnType<typeof createPipelineContext>['r2Writer']>,
		})

		await syncAnimeDetails(ctx, ['attack-on-titan'])

		expect(writerSpy.animeDetails).toEqual([
			{
				animeId: 'attack-on-titan',
				title: 'Attack on Titan',
				otherTitles: [],
				description: null,
				originalLink: 'https://www3.animeflv.net/anime/attack-on-titan',
				status: null,
				type: 'TV',
				genres: null,
				images: {
					coverImage: 'https://cdn.example/aot.webp',
					carouselImages: [],
				},
				relatedAnimes: [],
			},
		])
		expect(writerSpy.animeJikanDetails).toHaveLength(0)
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
				resourceId: 'attack-on-titan',
				status: 'success',
				errorMessage: undefined,
			},
			{
				resourceType: 'anime_jikan_detail',
				resourceId: 'attack-on-titan',
				status: 'error',
				errorMessage: 'Jikan detail unavailable',
			},
		])
		expect(loggerSpy.warns).toEqual([
			{
				message: 'syncAnimeDetails: cover mirror failed',
				meta: {
					animeId: 'attack-on-titan',
					error: 'Error: r2 down',
				},
			},
		])
	})
})
