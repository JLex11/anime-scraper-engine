import type { AnimeSeedRecord } from '../types/models'

export const humanizeAnimeId = (animeId: string) => animeId.replaceAll('-', ' ').trim()

export const buildAnimeSeed = (animeId: string, title = humanizeAnimeId(animeId)): AnimeSeedRecord => ({
	animeId,
	title,
	type: 'Anime',
	originalLink: `https://www3.animeflv.net/anime/${animeId}`,
})
