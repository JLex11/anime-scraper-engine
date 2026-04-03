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

export interface AnimeJikanTitle {
	type: string
	title: string
}

export interface AnimeJikanImageVariant {
	image_url: string | null
	small_image_url: string | null
	large_image_url: string | null
}

export interface AnimeJikanImages {
	jpg?: AnimeJikanImageVariant | null
	webp?: AnimeJikanImageVariant | null
}

export interface AnimeJikanTrailer {
	youtube_id: string | null
	url: string | null
	embed_url: string | null
	images?: Record<string, string | null> | null
}

export interface AnimeJikanNamedLink {
	name: string
	url: string
}

export interface AnimeJikanGenre {
	mal_id: number
	type: string
	name: string
	url: string
}

export interface AnimeJikanStudio {
	mal_id: number
	type: string
	name: string
	url: string
}

export interface AnimeJikanRelationEntry {
	mal_id: number
	type: string
	name: string
	url: string
}

export interface AnimeJikanRelation {
	relation: string
	entry: AnimeJikanRelationEntry[]
}

export interface AnimeJikanPromo {
	title: string
	trailer: AnimeJikanTrailer
}

export interface AnimeJikanDetail {
	animeId: string
	malId: number
	malUrl: string | null
	matchedQuery: string
	matchedTitle: string
	matchScore: number
	title: string
	titleEnglish?: string | null
	titleJapanese?: string | null
	synopsis?: string | null
	background?: string | null
	type?: string | null
	status?: string | null
	rating?: string | null
	source?: string | null
	season?: string | null
	year?: number | null
	episodes?: number | null
	duration?: string | null
	score?: number | null
	scoredBy?: number | null
	rank?: number | null
	popularity?: number | null
	members?: number | null
	favorites?: number | null
	titles: AnimeJikanTitle[]
	images: AnimeJikanImages | null
	trailer: AnimeJikanTrailer | null
	promos: AnimeJikanPromo[]
	genres: AnimeJikanGenre[]
	studios: AnimeJikanStudio[]
	externalLinks: AnimeJikanNamedLink[]
	streamingLinks: AnimeJikanNamedLink[]
	relations: AnimeJikanRelation[]
	jikanFetchedAt: string
	jikanExpiresAt: string
}

export interface AnimeJikanRefreshMeta {
	malId: number | null
	jikanExpiresAt: string | null
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
