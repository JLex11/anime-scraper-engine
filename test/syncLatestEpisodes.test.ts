import { describe, expect, test } from 'bun:test'
import { syncLatestEpisodes } from '../src/pipelines/syncLatestEpisodes'
import { createPipelineContextMock } from './helpers/pipelineTestUtils'
import { loadFixture } from './helpers/loadFixture'

describe('syncLatestEpisodes', () => {
	test('scrapea episodios recientes y persiste feed e items normalizados', async () => {
		const homepageHtml = await loadFixture('animeflv/home.latest.html')

		const { ctx, calls } = createPipelineContextMock({
			fetchHtml: async () => homepageHtml,
		})

		await syncLatestEpisodes(ctx)

		expect(calls.episodes).toHaveLength(1)
		expect(calls.episodes[0].slice(0, 2)).toEqual([
			{
				episodeId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1',
				animeId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
				episode: 1,
				title: 'mamonogurai no boukensha ore dake mamono wo kuratte tsuyoku naru',
				originalLink:
					'https://www3.animeflv.net/ver/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1',
				image: null,
			},
			{
				episodeId: 'reincarnation-no-kaben-1',
				animeId: 'reincarnation-no-kaben',
				episode: 1,
				title: 'reincarnation no kaben',
				originalLink: 'https://www3.animeflv.net/ver/reincarnation-no-kaben-1',
				image: null,
			},
		])
		expect(calls.episodeFeedItems).toHaveLength(1)
		expect(calls.episodeFeedItems[0].feedType).toBe('latest')
		expect(calls.episodeFeedItems[0].episodeIds.slice(0, 2)).toEqual([
			'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1',
			'reincarnation-no-kaben-1',
		])
		expect(calls.syncStates).toEqual([
			{
				resourceType: 'feed',
				resourceId: 'latest_episodes',
				status: 'success',
				errorMessage: undefined,
			},
		])
	})

	test('marca error y loguea warning si la homepage no esta disponible', async () => {
		const { ctx, calls } = createPipelineContextMock({
			fetchHtml: async () => null,
		})

		await syncLatestEpisodes(ctx)

		expect(calls.episodes).toHaveLength(0)
		expect(calls.episodeFeedItems).toHaveLength(0)
		expect(calls.syncStates).toEqual([
			{
				resourceType: 'feed',
				resourceId: 'latest_episodes',
				status: 'error',
				errorMessage: 'Homepage unavailable',
			},
		])
		expect(calls.warns).toEqual([
			{
				message: 'syncLatestEpisodes: homepage unavailable',
				meta: undefined,
			},
		])
	})
})
