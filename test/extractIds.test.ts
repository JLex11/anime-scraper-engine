import { describe, expect, test } from 'bun:test'
import { extractAnimeIds, extractEpisodeIds } from '../src/extractors/extractIds'
import { loadFixture } from './helpers/loadFixture'

describe('extractIds', () => {
	test('extractAnimeIds deduplica ids y remueve query strings', async () => {
		const html = await loadFixture('animeflv/home.latest.html')

		const animeIds = await extractAnimeIds(html)

		expect(animeIds.slice(0, 5)).toEqual([
			'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
			'reincarnation-no-kaben',
			'mata-korosarete-shimatta-no-desu-ne-tanteisama',
			'kirio-fanclub',
			'haibarakun-no-tsuyokute-seishun-new-game',
		])
	})

	test('extractEpisodeIds obtiene episodios desde un selector custom', async () => {
		const html = `
			<div class="CustomEpisodes">
				<a href="/ver/one-piece-1000">1000</a>
				<a href="/ver/one-piece-1001?ref=home">1001</a>
				<a href="/ver/one-piece-1000">1000 repetido</a>
			</div>
		`

		const episodeIds = await extractEpisodeIds(html, '.CustomEpisodes a')

		expect(episodeIds).toEqual(['one-piece-1000', 'one-piece-1001'])
	})
})
