export type AnimeFeedType = 'directory' | 'latest' | 'broadcast' | 'rating'
export type EpisodeFeedType = 'latest'

export interface AnimeFeedItem {
	feedType: AnimeFeedType
	animeId: string
	page: number
	position: number
	feedFetchedAt: string
}

export interface EpisodeFeedItem {
	feedType: EpisodeFeedType
	episodeId: string
	position: number
	feedFetchedAt: string
}

export interface AnimeDetail {
	animeId: string
	title: string
	description?: string | null
	originalLink?: string | null
	status?: string | null
	type?: string | null
	genres?: string[] | null
	images?: {
		coverImage: string | null
		carouselImages: Array<{
			link: string | null
			position: string
			width: number
			height: number
		}>
	} | null
	coverImageKey?: string | null
	carouselImageKeys?: string[]
	relatedAnimes?: Array<{
		animeId: string
		title: string
		relation: string
	}>
}

export interface EpisodeDetail {
	episodeId: string
	animeId: string
	episode: number
	title?: string | null
	originalLink?: string | null
	image?: string | null
}

export interface EpisodeSourcesRecord {
	episodeId: string
	episode: number
	videos: unknown
	scrapedAt: string
	expiresAt: string | null
}
