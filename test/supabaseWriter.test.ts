import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseWriter } from '../src/writers/supabaseWriter'

type UpsertCall = {
	table: string
	payload: unknown
	options: unknown
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
	const selectCalls: SelectCall[] = []

	const supabase = {
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
		selectCalls,
	}
}

describe('SupabaseWriter', () => {
	test('upsertAnimeFeedItems persiste feed de animes con page y position', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertAnimeFeedItems('latest', ['naruto', 'bleach'], 2)

		expect(upsertCalls).toHaveLength(1)
		expect(upsertCalls[0].table).toBe('anime_feed_items')
		expect(upsertCalls[0].options).toEqual({ onConflict: 'feed_type,page,position' })

		const payload = upsertCalls[0].payload as Array<Record<string, unknown>>
		expect(payload).toEqual([
			{
				feed_type: 'latest',
				anime_id: 'naruto',
				page: 2,
				position: 0,
				feed_fetched_at: expect.any(String),
			},
			{
				feed_type: 'latest',
				anime_id: 'bleach',
				page: 2,
				position: 1,
				feed_fetched_at: expect.any(String),
			},
		])
	})

	test('upsertAnimeDetails persiste anime y relacionados', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertAnimeDetails({
			animeId: 'naruto',
			title: 'Naruto',
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

	test('upsertEpisodeFeedItems persiste feed de episodios', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertEpisodeFeedItems('latest', ['bleach-1', 'bleach-2'])

		expect(upsertCalls).toHaveLength(1)
		expect(upsertCalls[0].table).toBe('episode_feed_items')
		expect(upsertCalls[0].options).toEqual({ onConflict: 'feed_type,position' })

		const payload = upsertCalls[0].payload as Array<Record<string, unknown>>
		expect(payload).toEqual([
			{
				feed_type: 'latest',
				episode_id: 'bleach-1',
				position: 0,
				feed_fetched_at: expect.any(String),
			},
			{
				feed_type: 'latest',
				episode_id: 'bleach-2',
				position: 1,
				feed_fetched_at: expect.any(String),
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

	test('upsertAnimeDetails persiste animes y relacionados en tablas separadas', async () => {
		const { supabase, upsertCalls } = createSupabaseMock()
		const writer = new SupabaseWriter(supabase)

		await writer.upsertAnimeDetails({
			animeId: 'frieren',
			title: 'Sousou no Frieren',
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
