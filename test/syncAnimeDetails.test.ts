import { describe, expect, test } from 'bun:test'
import { syncAnimeDetails } from '../src/pipelines/syncAnimeDetails'
import { createLoggerSpy, createPipelineContext, createWriterSpy } from './pipelineTestUtils'
import { loadFixture } from './helpers/loadFixture'

describe('syncAnimeDetails', () => {
	test('scrapea detalles unicos y refleja portada a R2 cuando esta habilitado', async () => {
		const animeHtml = await loadFixture('animeflv/anime.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru.html')
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()
		const mirroredUrls: string[] = []
		const fetchedPaths: string[] = []

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
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
		expect(writerSpy.animeDetails).toHaveLength(1)
		expect(writerSpy.animeDetails[0]).toMatchObject({
			animeId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
			title: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
			coverImageKey: 'animes/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru/4343.jpg',
			images: {
				coverImage:
					'https://r2.example/animes/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru/4343.jpg',
				carouselImages: [],
			},
		})
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
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
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
				resourceId: 'monster',
				status: 'error',
				errorMessage: 'Could not parse anime detail',
			},
		])
	})

	test('si R2 falla, persiste el detalle y deja warning', async () => {
		const writerSpy = createWriterSpy()
		const loggerSpy = createLoggerSpy()

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			logger: loggerSpy.logger,
			fetchHtml: async () => `
				<div class="Ficha">
					<h1> Attack on Titan </h1>
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
				description: null,
				originalLink: 'https://www3.animeflv.net/anime/attack-on-titan',
				genres: null,
				images: {
					coverImage: 'https://cdn.example/aot.webp',
					carouselImages: [],
				},
				relatedAnimes: [],
			},
		])
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: 'anime_detail',
				resourceId: 'attack-on-titan',
				status: 'success',
				errorMessage: undefined,
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
