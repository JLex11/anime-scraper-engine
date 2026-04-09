import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseWriter } from '../src/writers/supabaseWriter'

type UpsertCall = {
	table: string
	payload: unknown
	options: unknown
	method?: 'insert'
}

type RpcCall = {
	fn: string
	args: Record<string, unknown>
}

type SelectCall = {
	table: string
	columns: string
	filters: Array<{ type: string; column: string; value: unknown }>
	orders: Array<{ column: string; ascending: boolean }>
	limit?: number
}

const createSupabaseMock = (
	errorByTable?: Partial<Record<string, string>>,
	selectDataByTable?: Partial<Record<string, unknown[]>>
) => {
	const upsertCalls: UpsertCall[] = []
	const rpcCalls: RpcCall[] = []
	const selectCalls: SelectCall[] = []

	const supabase = {
		rpc(fn: string, args: Record<string, unknown>) {
			rpcCalls.push({ fn, args })
			return Promise.resolve({ data: null, error: errorByTable?.[fn] ?? null })
		},
		from(table: string) {
			const query: SelectCall = {
				table,
				columns: '',
				filters: [],
				orders: [],
			}

			return {
				upsert: async (payload: unknown, options: unknown) => {
					upsertCalls.push({ table, payload, options })
					return { data: null, error: errorByTable?.[table] ?? null }
				},
				insert: async (payload: unknown, options: unknown) => {
					upsertCalls.push({ table, payload, options, method: 'insert' })
					return { data: null, error: errorByTable?.[table] ?? null }
				},
				select(columns: string) {
					query.columns = columns
					return this
				},
				order(column: string, options: { ascending: boolean }) {
					query.orders.push({ column, ascending: options.ascending })
					return this
				},
				limit(value: number) {
					query.limit = value
					selectCalls.push({ ...query, filters: [...query.filters], orders: [...query.orders] })
					return Promise.resolve({ data: selectDataByTable?.[table] ?? null, error: errorByTable?.[table] ?? null })
				},
				gte(column: string, value: unknown) {
					query.filters.push({ type: 'gte', column, value })
					return this
				},
				eq(column: string, value: unknown) {
					query.filters.push({ type: 'eq', column, value })
					return this
				},
				in(column: string, value: unknown) {
					query.filters.push({ type: 'in', column, value })
					selectCalls.push({ ...query, filters: [...query.filters], orders: [...query.orders] })
					return Promise.resolve({ data: selectDataByTable?.[table] ?? null, error: errorByTable?.[table] ?? null })
				},
			}
		},
	}

	return {
		supabase: supabase as unknown as SupabaseClient,
		upsertCalls,
		rpcCalls,
		selectCalls,
	}
}

describe('SupabaseWriter', () => {
	test('upsertAnimeFeedItems reemplaza snapshot de feed de animes via rpc', async () => {
		const { supabase, rpcCalls, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertAnimeFeedItems('latest', ['naruto', 'bleach', 'naruto', ''], 2)

		expect(upsertCalls).toHaveLength(0)
		expect(rpcCalls).toEqual([
			{
				fn: 'replace_anime_feed_page',
				args: {
					p_feed_type: 'latest',
					p_page: 2,
					p_anime_ids: ['naruto', 'bleach'],
					p_feed_fetched_at: expect.any(String),
				},
			},
		])
	})

	test('upsertEpisodeFeedItems reemplaza snapshot de episodios via rpc', async () => {
		const { supabase, rpcCalls, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertEpisodeFeedItems('latest', ['naruto-1', 'bleach-2', 'naruto-1', ''])

		expect(upsertCalls).toHaveLength(0)
		expect(rpcCalls).toEqual([
			{
				fn: 'replace_episode_feed',
				args: {
					p_feed_type: 'latest',
					p_episode_ids: ['naruto-1', 'bleach-2'],
					p_feed_fetched_at: expect.any(String),
				},
			},
		])
	})

	test('ensureAnimeRecords inserta seeds con upsert idempotente', async () => {
		const { supabase, upsertCalls, selectCalls } = createSupabaseMock(undefined, {
			animes: [],
		})
		const writer = new SupabaseWriter(supabase)

		await writer.ensureAnimeRecords([
			{
				animeId: 'naruto',
				title: 'Naruto',
				type: 'Anime',
				originalLink: 'https://www3.animeflv.net/anime/naruto',
			},
			{
				animeId: 'naruto',
				title: 'Naruto duplicate',
			},
		])

		expect(upsertCalls).toEqual([
			{
				table: 'animes',
				payload: [
					{
						animeId: 'naruto',
						title: 'Naruto',
						type: 'Anime',
						originalLink: 'https://www3.animeflv.net/anime/naruto',
					},
				],
				options: { onConflict: 'animeId', ignoreDuplicates: true },
			},
		])
		expect(selectCalls).toHaveLength(0)
	})

	test('ensureAnimeRecords sigue siendo idempotente si el anime ya existe', async () => {
		const { supabase, upsertCalls } = createSupabaseMock(undefined, {
			animes: [{ animeId: 'naruto' }],
		})
		const writer = new SupabaseWriter(supabase)

		await writer.ensureAnimeRecords([
			{
				animeId: 'naruto',
				title: 'Naruto',
			},
		])

		expect(upsertCalls).toEqual([
			{
				table: 'animes',
				payload: [
					{
						animeId: 'naruto',
						title: 'Naruto',
						type: 'Anime',
						originalLink: null,
					},
				],
				options: { onConflict: 'animeId', ignoreDuplicates: true },
			},
		])
	})

	test('upsertAnimeDetails persiste anime y relacionados', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertAnimeDetails({
			animeId: 'naruto',
			title: 'Naruto',
			otherTitles: ['ナルト'],
			description: 'Historia ninja',
			originalLink: 'https://www3.animeflv.net/anime/naruto',
			genres: ['Accion'],
			images: { coverImage: 'https://cdn.example/naruto.webp', carouselImages: [] },
			coverImageKey: 'animes/naruto.webp',
			carouselImageKeys: [],
			relatedAnimes: [
				{
					animeId: 'naruto-shippuden',
					title: 'Naruto Shippuden',
					relation: 'Secuela',
				},
			],
		})

		expect(upsertCalls).toHaveLength(2)
		expect(upsertCalls[0]).toMatchObject({
			table: 'animes',
			options: { onConflict: 'animeId' },
		})
		expect(upsertCalls[0].payload).toEqual([
			{
				animeId: 'naruto',
				title: 'Naruto',
				otherTitles: ['ナルト'],
				cover_image_key: 'animes/naruto.webp',
				carousel_image_keys: [],
				description: 'Historia ninja',
				originalLink: 'https://www3.animeflv.net/anime/naruto',
				status: null,
				type: null,
				genres: ['Accion'],
				images: { coverImage: 'https://cdn.example/naruto.webp', carouselImages: [] },
			},
		])
		expect(upsertCalls[1]).toEqual({
			table: 'related_animes',
			payload: [
				{
					anime_id: 'naruto',
					related_id: 'naruto-shippuden',
					title: 'Naruto Shippuden',
					relation: 'Secuela',
				},
			],
			options: { onConflict: 'anime_id,related_id,relation' },
		})
	})

	test('upsertAnimeJikanDetail persiste enrichment Jikan con columnas snake_case y json', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertAnimeJikanDetail({
			animeId: 'naruto',
			malId: 20,
			malUrl: 'https://myanimelist.net/anime/20/Naruto',
			matchedQuery: 'Naruto',
			matchedTitle: 'Naruto',
			matchScore: 1,
			title: 'Naruto',
			titleEnglish: 'Naruto',
			titleJapanese: 'ナルト',
			synopsis: 'Historia ninja',
			background: null,
			type: 'TV',
			status: 'Finished Airing',
			rating: 'PG-13',
			source: 'Manga',
			season: 'fall',
			year: 2002,
			episodes: 220,
			duration: '23 min per ep',
			score: 7.9,
			scoredBy: 1000,
			rank: 500,
			popularity: 20,
			members: 300000,
			favorites: 50000,
			titles: [{ type: 'Default', title: 'Naruto' }],
			images: {
				jpg: {
					image_url: 'https://cdn.example/naruto.jpg',
					small_image_url: 'https://cdn.example/naruto-small.jpg',
					large_image_url: 'https://cdn.example/naruto-large.jpg',
				},
			},
			trailer: {
				youtube_id: 'abc123',
				url: 'https://youtube.com/watch?v=abc123',
				embed_url: 'https://www.youtube-nocookie.com/embed/abc123',
				images: { image_url: 'https://img.youtube.com/abc123/default.jpg' },
			},
			promos: [
				{
					title: 'PV 1',
					trailer: {
						youtube_id: 'promo123',
						url: 'https://youtube.com/watch?v=promo123',
						embed_url: 'https://www.youtube-nocookie.com/embed/promo123',
						images: { image_url: 'https://img.youtube.com/promo123/default.jpg' },
					},
				},
			],
			genres: [{ mal_id: 1, type: 'anime', name: 'Action', url: 'https://myanimelist.net/anime/genre/1/Action' }],
			studios: [{ mal_id: 17, type: 'anime', name: 'Pierrot', url: 'https://myanimelist.net/anime/producer/17/Pierrot' }],
			externalLinks: [{ name: 'Official Site', url: 'https://naruto-official.com/' }],
			streamingLinks: [{ name: 'Crunchyroll', url: 'https://crunchyroll.com/naruto' }],
			relations: [
				{
					relation: 'Sequel',
					entry: [
						{
							mal_id: 1735,
							type: 'anime',
							name: 'Naruto: Shippuuden',
							url: 'https://myanimelist.net/anime/1735/Naruto__Shippuuden',
						},
					],
				},
			],
			jikanFetchedAt: '2026-04-02T12:00:00.000Z',
			jikanExpiresAt: '2026-04-09T12:00:00.000Z',
		})

		expect(upsertCalls).toHaveLength(1)
		expect(upsertCalls[0]).toEqual({
			table: 'anime_jikan_details',
			payload: [
				{
					anime_id: 'naruto',
					mal_id: 20,
					mal_url: 'https://myanimelist.net/anime/20/Naruto',
					matched_query: 'Naruto',
					matched_title: 'Naruto',
					match_score: 1,
					title: 'Naruto',
					title_english: 'Naruto',
					title_japanese: 'ナルト',
					synopsis: 'Historia ninja',
					background: null,
					type: 'TV',
					status: 'Finished Airing',
					rating: 'PG-13',
					source: 'Manga',
					season: 'fall',
					year: 2002,
					episodes: 220,
					duration: '23 min per ep',
					score: 7.9,
					scored_by: 1000,
					rank: 500,
					popularity: 20,
					members: 300000,
					favorites: 50000,
					titles: [{ type: 'Default', title: 'Naruto' }],
					images: {
						jpg: {
							image_url: 'https://cdn.example/naruto.jpg',
							small_image_url: 'https://cdn.example/naruto-small.jpg',
							large_image_url: 'https://cdn.example/naruto-large.jpg',
						},
					},
					trailer: {
						youtube_id: 'abc123',
						url: 'https://youtube.com/watch?v=abc123',
						embed_url: 'https://www.youtube-nocookie.com/embed/abc123',
						images: { image_url: 'https://img.youtube.com/abc123/default.jpg' },
					},
					promos: [
						{
							title: 'PV 1',
							trailer: {
								youtube_id: 'promo123',
								url: 'https://youtube.com/watch?v=promo123',
								embed_url: 'https://www.youtube-nocookie.com/embed/promo123',
								images: { image_url: 'https://img.youtube.com/promo123/default.jpg' },
							},
						},
					],
					genres: [{ mal_id: 1, type: 'anime', name: 'Action', url: 'https://myanimelist.net/anime/genre/1/Action' }],
					studios: [{ mal_id: 17, type: 'anime', name: 'Pierrot', url: 'https://myanimelist.net/anime/producer/17/Pierrot' }],
					external_links: [{ name: 'Official Site', url: 'https://naruto-official.com/' }],
					streaming_links: [{ name: 'Crunchyroll', url: 'https://crunchyroll.com/naruto' }],
					relations: [
						{
							relation: 'Sequel',
							entry: [
								{
									mal_id: 1735,
									type: 'anime',
									name: 'Naruto: Shippuuden',
									url: 'https://myanimelist.net/anime/1735/Naruto__Shippuuden',
								},
							],
						},
					],
					jikan_fetched_at: '2026-04-02T12:00:00.000Z',
					jikan_expires_at: '2026-04-09T12:00:00.000Z',
				},
			],
			options: { onConflict: 'anime_id' },
		})
	})

	test('upsertEpisodes persiste episodios normalizados', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertEpisodes([
			{
				episodeId: 'bleach-1',
				animeId: 'bleach',
				episode: 1,
				title: 'Bleach',
				originalLink: 'https://www3.animeflv.net/ver/bleach-1',
				image: null,
			},
		])

		expect(upsertCalls).toEqual([
			{
				table: 'episodes',
				payload: [
					{
						episodeId: 'bleach-1',
						animeId: 'bleach',
						episode: 1,
						title: 'Bleach',
						originalLink: 'https://www3.animeflv.net/ver/bleach-1',
						image: null,
					},
				],
				options: { onConflict: 'episodeId' },
			},
		])
	})

	test('upsertEpisodeFeedItems persiste feed de episodios via rpc', async () => {
		const { supabase, rpcCalls, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertEpisodeFeedItems('latest', ['bleach-1', 'bleach-2'])

		expect(upsertCalls).toHaveLength(0)
		expect(rpcCalls).toEqual([
			{
				fn: 'replace_episode_feed',
				args: {
					p_feed_type: 'latest',
					p_episode_ids: ['bleach-1', 'bleach-2'],
					p_feed_fetched_at: expect.any(String),
				},
			},
		])
	})

	test('upsertEpisodeSources persiste el registro con columnas snake_case', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertEpisodeSources({
			episodeId: 'naruto-7',
			episode: 7,
			videos: [{ server: 'sw', url: 'https://cdn.example/7.mp4' }],
			scrapedAt: '2026-04-02T12:00:00.000Z',
			expiresAt: '2026-04-02T12:30:00.000Z',
		})

		expect(upsertCalls).toEqual([
			{
				table: 'episode_sources',
				payload: [
					{
						episode_id: 'naruto-7',
						episode: 7,
						videos: [{ server: 'sw', url: 'https://cdn.example/7.mp4' }],
						scraped_at: '2026-04-02T12:00:00.000Z',
						expires_at: '2026-04-02T12:30:00.000Z',
					},
				],
				options: { onConflict: 'episode_id' },
			},
		])
	})

	test('markSyncState persiste errores con metadata de sincronizacion', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.markSyncState('episode_sources', 'naruto-7', 'error', 'boom')

		expect(upsertCalls).toHaveLength(1)
		expect(upsertCalls[0].table).toBe('sync_state')
		expect(upsertCalls[0].options).toEqual({ onConflict: 'resource_type,resource_id' })

		const payload = upsertCalls[0].payload as Array<Record<string, unknown>>
		expect(payload).toHaveLength(1)
		expect(payload[0]).toMatchObject({
			resource_type: 'episode_sources',
			resource_id: 'naruto-7',
			status: 'error',
			error_message: 'boom',
			error_count: 1,
		})
		expect(payload[0].last_error_at).toEqual(expect.any(String))
		expect(payload[0].last_success_at).toBeNull()
	})

	test('getAnimeJikanRefreshMeta retorna malId y expiracion para el anime', async () => {
		const { supabase, selectCalls } = createSupabaseMock(undefined, {
			anime_jikan_details: [{ mal_id: 20, jikan_expires_at: '2026-04-09T12:00:00.000Z' }],
		})
		const writer = new SupabaseWriter(supabase)

		const result = await writer.getAnimeJikanRefreshMeta('naruto')

		expect(result).toEqual({
			malId: 20,
			jikanExpiresAt: '2026-04-09T12:00:00.000Z',
		})
		expect(selectCalls).toContainEqual({
			table: 'anime_jikan_details',
			columns: 'mal_id,jikan_expires_at',
			filters: [{ type: 'eq', column: 'anime_id', value: 'naruto' }],
			orders: [],
			limit: 1,
		})
	})

	test('upsertAnimeDetails persiste animes y relacionados en tablas separadas', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertAnimeDetails({
			animeId: 'frieren',
			title: 'Sousou no Frieren',
			otherTitles: ["Frieren: Beyond Journey's End"],
			description: 'Viaje despues del viaje.',
			originalLink: 'https://www3.animeflv.net/anime/frieren',
			status: 'En emision',
			type: 'TV',
			genres: ['Fantasy'],
			images: {
				coverImage: 'https://cdn.example/frieren.webp',
				carouselImages: [],
			},
			coverImageKey: 'animes/frieren.webp',
			carouselImageKeys: ['animes/frieren-banner.webp'],
			relatedAnimes: [
				{
					animeId: 'frieren-special',
					title: 'Frieren Special',
					relation: 'Relacionado',
				},
			],
		})

		expect(upsertCalls).toHaveLength(2)
		expect(upsertCalls[0]).toEqual({
			table: 'animes',
			payload: [
				{
				animeId: 'frieren',
				title: 'Sousou no Frieren',
				otherTitles: ["Frieren: Beyond Journey's End"],
				cover_image_key: 'animes/frieren.webp',
					carousel_image_keys: ['animes/frieren-banner.webp'],
					description: 'Viaje despues del viaje.',
					originalLink: 'https://www3.animeflv.net/anime/frieren',
					status: 'En emision',
					type: 'TV',
					genres: ['Fantasy'],
					images: {
						coverImage: 'https://cdn.example/frieren.webp',
						carouselImages: [],
					},
				},
			],
			options: { onConflict: 'animeId' },
		})
		expect(upsertCalls[1]).toEqual({
			table: 'related_animes',
			payload: [
				{
					anime_id: 'frieren',
					related_id: 'frieren-special',
					title: 'Frieren Special',
					relation: 'Relacionado',
				},
			],
			options: { onConflict: 'anime_id,related_id,relation' },
		})
	})

	test('upsertEpisodes persiste episodios con conflicto por episodeId', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertEpisodes([
			{
				episodeId: 'dandadan-1',
				animeId: 'dandadan',
				episode: 1,
				title: 'dandadan',
				originalLink: 'https://www3.animeflv.net/ver/dandadan-1',
				image: null,
			},
		])

		expect(upsertCalls).toEqual([
			{
				table: 'episodes',
				payload: [
					{
						episodeId: 'dandadan-1',
						animeId: 'dandadan',
						episode: 1,
						title: 'dandadan',
						originalLink: 'https://www3.animeflv.net/ver/dandadan-1',
						image: null,
					},
				],
				options: { onConflict: 'episodeId' },
			},
		])
	})

	test('lanza error cuando Supabase responde error en una insercion', async () => {
		const { supabase } = createSupabaseMock({
			episode_sources: 'duplicate key',
		})
		const writer = new SupabaseWriter(supabase)

		await expect(
			writer.upsertEpisodeSources({
				episodeId: 'naruto-7',
				episode: 7,
				videos: [],
				scrapedAt: '2026-04-02T12:00:00.000Z',
				expiresAt: '2026-04-02T12:30:00.000Z',
			})
		).rejects.toThrow('upsert episode_sources: duplicate key')
	})

	test('getEpisodeIdsNeedingSourceRefresh devuelve solo episodios faltantes o vencidos', async () => {
		const { supabase, selectCalls } = createSupabaseMock(undefined, {
			episodes: [
				{ episodeId: 'one-piece-1' },
				{ episodeId: 'one-piece-2' },
				{ episodeId: 'one-piece-3' },
			],
			episode_sources: [
				{ episode_id: 'one-piece-1', expires_at: '2026-04-02T10:00:00.000Z' },
				{ episode_id: 'one-piece-2', expires_at: '2026-04-02T14:00:00.000Z' },
			],
		})
		const writer = new SupabaseWriter(supabase)

		const result = await writer.getEpisodeIdsNeedingSourceRefresh(3, 7, new Date('2026-04-02T12:00:00.000Z'))

		expect(result).toEqual(['one-piece-1', 'one-piece-3'])
		expect(selectCalls).toEqual([
			{
				table: 'episodes',
				columns: 'episodeId',
				filters: [{ type: 'gte', column: 'updated_at', value: expect.any(String) }],
				orders: [{ column: 'updated_at', ascending: false }],
				limit: 3,
			},
			{
				table: 'episode_sources',
				columns: 'episode_id,expires_at',
				filters: [{ type: 'in', column: 'episode_id', value: ['one-piece-1', 'one-piece-2', 'one-piece-3'] }],
				orders: [],
			},
		])
	})

	test('getMaxEpisodeNumberByAnimeId devuelve el episodio mas alto conocido', async () => {
		const { supabase, selectCalls } = createSupabaseMock(undefined, {
			episodes: [{ episode: 1200 }],
		})
		const writer = new SupabaseWriter(supabase)

		const result = await writer.getMaxEpisodeNumberByAnimeId('one-piece-tv')

		expect(result).toBe(1200)
		expect(selectCalls).toEqual([
			{
				table: 'episodes',
				columns: 'episode',
				filters: [{ type: 'eq', column: 'animeId', value: 'one-piece-tv' }],
				orders: [{ column: 'episode', ascending: false }],
				limit: 1,
			},
		])
	})
})
