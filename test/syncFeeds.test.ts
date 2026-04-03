import { describe, expect, test } from 'bun:test'
import { syncBroadcast } from '../src/pipelines/syncBroadcast'
import { syncDirectoryAnimes } from '../src/pipelines/syncDirectoryAnimes'
import { syncLatestAnimes } from '../src/pipelines/syncLatestAnimes'
import { syncLatestEpisodes } from '../src/pipelines/syncLatestEpisodes'
import { syncTopRated } from '../src/pipelines/syncTopRated'
import { createLoggerSpy, createPipelineContext, createWriterSpy } from './pipelineTestUtils'

const animeListHtml = (ids: string[]) => `
	<ul class="ListAnimes">
		${ids.map((id) => `<li><a href="/anime/${id}">${id}</a></li>`).join('')}
	</ul>
`

const broadcastHtml = (ids: string[]) => `
	<div class="Emision">
		<ul class="ListSdbr">
			${ids.map((id) => `<li><a href="/anime/${id}">${id}</a></li>`).join('')}
		</ul>
	</div>
`

const detailHtml = (title: string, episodes: number[]) => `
	<div class="Ficha">
		<h1>${title}</h1>
		<div class="Description"><p>${title} descripcion</p></div>
	</div>
	<div class="AnimeCover"><img src="https://cdn.example/${title}.webp" /></div>
	<script>
		const episodes = ${JSON.stringify(episodes.map((episode) => [episode, String(episode)]))};
	</script>
`

describe('feed pipelines', () => {
	test('syncLatestEpisodes persiste episodios recientes y feed latest', async () => {
		const writerSpy = createWriterSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			htmlByPath: {
				'/': `
					<ul class="ListEpisodios">
						<li><a href="/ver/naruto-shippuden-500">500</a></li>
						<li><a href="/ver/bleach-20">20</a></li>
					</ul>
				`,
			},
		})

		await syncLatestEpisodes(ctx)

		expect(writerSpy.animeSeedRecords).toEqual([
			[
				{
					animeId: 'naruto-shippuden',
					title: 'naruto shippuden',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/naruto-shippuden',
				},
				{
					animeId: 'bleach',
					title: 'bleach',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/bleach',
				},
			],
		])
		expect(writerSpy.episodes).toHaveLength(1)
		expect(writerSpy.episodes[0]).toEqual([
			{
				episodeId: 'naruto-shippuden-500',
				animeId: 'naruto-shippuden',
				episode: 500,
				title: 'naruto shippuden',
				originalLink: 'https://www3.animeflv.net/ver/naruto-shippuden-500',
				image: null,
			},
			{
				episodeId: 'bleach-20',
				animeId: 'bleach',
				episode: 20,
				title: 'bleach',
				originalLink: 'https://www3.animeflv.net/ver/bleach-20',
				image: null,
			},
		])
		expect(writerSpy.episodeFeedItems).toEqual([
			{
				feedType: 'latest',
				episodeIds: ['naruto-shippuden-500', 'bleach-20'],
			},
		])
		expect(writerSpy.syncStates).toContainEqual({
			resourceType: 'feed',
			resourceId: 'latest_episodes',
			status: 'success',
			errorMessage: undefined,
		})
	})

	test('syncLatestAnimes persiste feed y calienta detalles para una ventana acotada', async () => {
		const writerSpy = createWriterSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			htmlByPath: {
				'/': animeListHtml(['naruto', 'bleach']),
				'/anime/naruto': detailHtml('Naruto', [1, 2]),
				'/anime/bleach': detailHtml('Bleach', [10]),
			},
		})

		await syncLatestAnimes(ctx)

		expect(writerSpy.animeSeedRecords).toEqual([
			[
				{
					animeId: 'naruto',
					title: 'naruto',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/naruto',
				},
				{
					animeId: 'bleach',
					title: 'bleach',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/bleach',
				},
			],
		])
		expect(writerSpy.animeFeedItems).toEqual([
			{ feedType: 'latest', animeIds: ['naruto', 'bleach'], page: 1 },
		])
		expect(writerSpy.animeDetails.map((detail) => detail.animeId)).toEqual(['naruto', 'bleach'])
		expect(writerSpy.episodes).toHaveLength(0)
		expect(writerSpy.syncStates).toContainEqual({
			resourceType: 'feed',
			resourceId: 'latest_animes',
			status: 'success',
			errorMessage: undefined,
		})
		expect(writerSpy.syncStates).toContainEqual({
			resourceType: 'anime_detail',
			resourceId: 'naruto',
			status: 'success',
			errorMessage: undefined,
		})
	})

	test('syncBroadcast toma ids desde el bloque de emision y persiste detalles', async () => {
		const writerSpy = createWriterSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			htmlByPath: {
				'/': broadcastHtml(['solo-leveling']),
				'/anime/solo-leveling': detailHtml('Solo Leveling', [1]),
			},
		})

		await syncBroadcast(ctx)

		expect(writerSpy.animeSeedRecords).toEqual([
			[
				{
					animeId: 'solo-leveling',
					title: 'solo leveling',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/solo-leveling',
				},
			],
		])
		expect(writerSpy.animeFeedItems).toEqual([
			{ feedType: 'broadcast', animeIds: ['solo-leveling'], page: 1 },
		])
		expect(writerSpy.animeDetails).toHaveLength(1)
		expect(writerSpy.animeDetails[0].animeId).toBe('solo-leveling')
		expect(writerSpy.syncStates).toContainEqual({
			resourceType: 'feed',
			resourceId: 'broadcast_animes',
			status: 'success',
			errorMessage: undefined,
		})
	})

	test('syncTopRated toma ids desde la pagina de rating y persiste detalles', async () => {
		const writerSpy = createWriterSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			htmlByPath: {
				'/browse?status=1&order=rating': animeListHtml(['frieren']),
				'/anime/frieren': detailHtml('Frieren', [1]),
			},
		})

		await syncTopRated(ctx)

		expect(writerSpy.animeSeedRecords).toEqual([
			[
				{
					animeId: 'frieren',
					title: 'frieren',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/frieren',
				},
			],
		])
		expect(writerSpy.animeFeedItems).toEqual([
			{ feedType: 'rating', animeIds: ['frieren'], page: 1 },
		])
		expect(writerSpy.animeDetails).toHaveLength(1)
		expect(writerSpy.animeDetails[0].animeId).toBe('frieren')
		expect(writerSpy.syncStates).toContainEqual({
			resourceType: 'feed',
			resourceId: 'rating_animes',
			status: 'success',
			errorMessage: undefined,
		})
	})

	test('syncDirectoryAnimes marca error parcial si faltan paginas pero persiste las disponibles', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			htmlByPath: {
				'/browse?page=1': animeListHtml(['naruto', 'bleach']),
				'/browse?page=2': null,
				'/browse?page=3': animeListHtml(['one-piece']),
			},
		})

		await syncDirectoryAnimes(ctx, 3)

		expect(writerSpy.animeSeedRecords).toEqual([
			[
				{
					animeId: 'naruto',
					title: 'naruto',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/naruto',
				},
				{
					animeId: 'bleach',
					title: 'bleach',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/bleach',
				},
			],
			[
				{
					animeId: 'one-piece',
					title: 'one piece',
					type: 'Anime',
					originalLink: 'https://www3.animeflv.net/anime/one-piece',
				},
			],
		])
		expect(writerSpy.animeFeedItems).toEqual([
			{ feedType: 'directory', animeIds: ['naruto', 'bleach'], page: 1 },
			{ feedType: 'directory', animeIds: ['one-piece'], page: 3 },
		])
		expect(loggerSpy.warns).toEqual([
			{
				message: 'syncDirectoryAnimes: page unavailable',
				meta: { page: 2 },
			},
		])
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'feed',
				resourceId: 'directory_animes',
				status: 'error',
				errorMessage: 'Directory pages unavailable: 2',
			},
		])
	})

	test('syncLatestAnimes marca error si la homepage no esta disponible', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			htmlByPath: {
				'/': null,
			},
		})

		await syncLatestAnimes(ctx)

		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'feed',
				resourceId: 'latest_animes',
				status: 'error',
				errorMessage: 'Homepage unavailable',
			},
		])
		expect(loggerSpy.warns).toEqual([
			{
				message: 'syncLatestAnimes: homepage unavailable',
				meta: undefined,
			},
		])
	})

	test('syncBroadcast marca error si la homepage no esta disponible', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			htmlByPath: {
				'/': null,
			},
		})

		await syncBroadcast(ctx)

		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'feed',
				resourceId: 'broadcast_animes',
				status: 'error',
				errorMessage: 'Homepage unavailable',
			},
		])
		expect(loggerSpy.warns).toEqual([
			{
				message: 'syncBroadcast: homepage unavailable',
				meta: undefined,
			},
		])
	})

	test('syncTopRated marca error si falla la pagina de rating', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			htmlByPath: {
				'/browse?status=1&order=rating': null,
			},
		})

		await syncTopRated(ctx)

		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'feed',
				resourceId: 'rating_animes',
				status: 'error',
				errorMessage: 'Rating page unavailable',
			},
		])
		expect(loggerSpy.warns).toEqual([
			{
				message: 'syncTopRated: rating page unavailable',
				meta: undefined,
			},
		])
	})

	test('syncDirectoryAnimes marca error si ninguna pagina esta disponible', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			htmlByPath: {
				'/browse?page=1': null,
				'/browse?page=2': null,
			},
		})

		await syncDirectoryAnimes(ctx, 2)

		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'feed',
				resourceId: 'directory_animes',
				status: 'error',
				errorMessage: 'No directory pages available',
			},
		])
		expect(loggerSpy.warns).toEqual([
			{
				message: 'syncDirectoryAnimes: page unavailable',
				meta: { page: 1 },
			},
			{
				message: 'syncDirectoryAnimes: page unavailable',
				meta: { page: 2 },
			},
		])
	})
})
