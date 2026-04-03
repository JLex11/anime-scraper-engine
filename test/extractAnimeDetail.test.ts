import { describe, expect, test } from 'bun:test'
import { extractAnimeDetail } from '../src/extractors/extractAnimeDetail'
import { loadFixture } from './helpers/loadFixture'

describe('extractAnimeDetail', () => {
	test('parsea titulo, descripcion, cover, generos y relacionados', async () => {
		const html = await loadFixture('animeflv/anime.mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru.html')

		const detail = await extractAnimeDetail('mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru', html)

		expect(detail).toEqual({
			animeId: 'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
			title: 'Mamonogurai no Boukensha: Ore dake Mamono wo Kuratte Tsuyoku Naru',
			description:
				'Nadie quiere a Rudd, el "Forager Sucio", en su equipo de aventuras. Su apodo—y su hedor—provienen de sus constantes excursiones al Laberinto Nocivo para recolectar hierbas medicinales, un trabajo del que sobrevive solo gracias a su habilidad de inmunidad al estatus. Cuando finalmente es reclutado como porteador de la fiesta, las cosas parecen mejorar... ¡Hasta que aparece un monstruo mortal de la mazmorras y sus falsos aliados lo utilizan como cebo antes de abandonarlo! Herido, desamparado y apenas sobreviviendo al ataque, Rudd rompe un tabú prohibido para mantenerse vivo: comer monstruos. Pero cuanto más devora, más poder gana, ¡dando inicio a una emocionante y aventurera fantasía gourmet!',
			originalLink:
				'https://www3.animeflv.net/anime/mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
			genres: ['Acci&oacute;n', 'Fantas&iacute;a'],
			images: {
				coverImage: '/uploads/animes/covers/4343.jpg',
				carouselImages: [],
			},
			relatedAnimes: [],
		})
	})

	test('retorna null cuando no encuentra titulo', async () => {
		const detail = await extractAnimeDetail(
			'mamonogurai-no-boukensha-ore-dake-mamono-wo-kuratte-tsuyoku-naru',
			'<div>sin estructura valida</div>'
		)

		expect(detail).toBeNull()
	})
})
