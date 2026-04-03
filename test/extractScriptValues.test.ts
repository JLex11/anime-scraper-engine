import { describe, expect, test } from 'bun:test'
import { extractEpisodeNumbers, extractEpisodeVideos } from '../src/extractors/extractScriptValues'
import { loadFixture } from './helpers/loadFixture'

describe('extractEpisodeVideos', () => {
	test('extrae el numero de episodio y videos desde el contenido script', async () => {
		const html = await loadFixture('animeflv/episode.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru-1.html')

		const result = await extractEpisodeVideos(html)

		expect(result.episode).toBe(1)
		const videos = result.videos as { SUB?: Array<Record<string, unknown>> }
		expect(videos.SUB?.length).toBeGreaterThanOrEqual(2)
		expect(videos.SUB?.[0]).toMatchObject({
			server: 'sw',
			title: 'SW',
			code: 'https://streamwish.to/e/paxufuv0ygdj',
		})
		expect(videos.SUB?.some((video) => video.server === 'mega')).toBe(true)
	})

	test('devuelve defaults cuando faltan variables parseables', async () => {
		const html = `
			<html>
				<body>
					<script>
						const episode_number = null;
						const videos = invalidJson;
					</script>
				</body>
			</html>
		`

		const result = await extractEpisodeVideos(html)

		expect(result).toEqual({
			episode: 0,
			videos: [],
		})
	})

	test('normaliza episode_number invalido a 0', async () => {
		const html = `
			<script>
				const episode_number = "NaN";
				const videos = [];
			</script>
		`

		const result = await extractEpisodeVideos(html)

		expect(result).toEqual({
			episode: 0,
			videos: [],
		})
	})
})

describe('extractEpisodeNumbers', () => {
	test('deduplica episodios y filtra valores invalidos', async () => {
		const html = await loadFixture('animeflv/anime.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru.html')

		const result = await extractEpisodeNumbers(html)

		expect(result).toEqual([1])
	})
})
