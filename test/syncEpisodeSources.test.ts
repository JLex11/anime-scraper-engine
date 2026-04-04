import { describe, expect, test } from 'bun:test'
import type { EpisodeSourcesRecord } from '../src/types/models'
import { syncEpisodeSources } from './helpers/realSyncEpisodeSources'
import { createPipelineContextMock } from './helpers/pipelineTestUtils'
import { loadFixture } from './helpers/loadFixture'

describe('syncEpisodeSources', () => {
	test('scrapea cada episodio unico y persiste el payload normalizado', async () => {
		const episodeHtml = await loadFixture(
			'animeflv/episode.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1.html'
		)
		const fetchedPaths: string[] = []
		const { ctx, calls } = createPipelineContextMock({
			fetchHtml: async (path) => {
				fetchedPaths.push(path)
				return episodeHtml
			},
		})

		await syncEpisodeSources(ctx, [
			'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1',
			'',
			'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1',
			'reincarnation-no-kaben-1',
		])

		expect(fetchedPaths).toEqual([
			'/ver/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1',
			'/ver/reincarnation-no-kaben-1',
		])
		expect(calls.episodeSources).toHaveLength(2)
		expect(calls.syncStates).toEqual([
			{
				resourceType: 'episode_sources',
				resourceId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1',
				status: 'success',
				errorMessage: undefined,
			},
			{
				resourceType: 'episode_sources',
				resourceId: 'reincarnation-no-kaben-1',
				status: 'success',
				errorMessage: undefined,
			},
		])

		for (const record of calls.episodeSources as EpisodeSourcesRecord[]) {
			expect(record.episode).toBe(1)
			const videos = record.videos as { SUB?: Array<Record<string, unknown>> }
			expect(videos.SUB?.[0]).toMatchObject({
				server: 'sw',
				title: 'SW',
			})
			expect(videos.SUB?.some((video) => video.server === 'stape')).toBe(true)
			expect(record.expiresAt).not.toBeNull()

			const scrapedAt = new Date(record.scrapedAt).getTime()
			const expiresAt = new Date(record.expiresAt!).getTime()
			expect(expiresAt - scrapedAt).toBe(30 * 60 * 1000)
		}
	})

	test('marca error cuando la pagina del episodio no esta disponible', async () => {
		const { ctx, calls } = createPipelineContextMock({
			fetchHtml: async () => null,
		})

		await syncEpisodeSources(ctx, ['one-piece-1'])

		expect(calls.episodeSources).toHaveLength(0)
		expect(calls.syncStates).toEqual([
			{
				resourceType: 'episode_sources',
				resourceId: 'one-piece-1',
				status: 'error',
				errorMessage: 'Episode source page unavailable',
			},
		])
	})
})
