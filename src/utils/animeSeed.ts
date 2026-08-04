import type { AnimeSeedRecord } from '../types/models'

export const humanizeAnimeId = (animeId: string) => animeId.replaceAll('-', ' ').trim()

export const isAnimeAv1BaseUrl = (baseUrl: string | null | undefined) => {
	try {
		const url = new URL(baseUrl || '')
		const hostname = url.hostname.toLowerCase()
		return hostname === 'animeav1.com' || hostname.endsWith('.animeav1.com')
	} catch {
		return false
	}
}

export const sourceOriginForBaseUrl = (baseUrl: string | null | undefined) =>
	isAnimeAv1BaseUrl(baseUrl) ? 'https://animeav1.com' : 'https://www3.animeflv.net'

export const buildAnimeSeed = (
	animeId: string,
	title = humanizeAnimeId(animeId),
	sourceBaseUrl?: string,
): AnimeSeedRecord => ({
	animeId,
	title,
	type: 'Anime',
	originalLink: `${sourceOriginForBaseUrl(sourceBaseUrl)}/${isAnimeAv1BaseUrl(sourceBaseUrl) ? 'media' : 'anime'}/${animeId}`,
})
