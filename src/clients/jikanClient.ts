import type {
	AnimeJikanGenre,
	AnimeJikanImages,
	AnimeJikanNamedLink,
	AnimeJikanPromo,
	AnimeJikanRelation,
	AnimeJikanStudio,
	AnimeJikanTitle,
	AnimeJikanTrailer,
} from '../types/models'

type JikanClientConfig = {
	jikanBaseUrl: string
	requestTimeoutMs: number
	requestRetryAttempts: number
	onLog?: (level: 'info' | 'warn', message: string, meta?: unknown) => void
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input as any, init)

type JikanEnvelope<T> = {
	data?: T
}

export interface JikanAnimeSearchResult {
	mal_id: number
	url: string | null
	title: string
	title_english: string | null
	title_japanese: string | null
	titles: AnimeJikanTitle[]
	type: string | null
	year: number | null
	episodes: number | null
	images: AnimeJikanImages | null
}

export interface JikanAnimeFull {
	mal_id: number
	url: string | null
	title: string
	title_english: string | null
	title_japanese: string | null
	titles: AnimeJikanTitle[]
	synopsis: string | null
	background: string | null
	type: string | null
	status: string | null
	rating: string | null
	source: string | null
	season: string | null
	year: number | null
	episodes: number | null
	duration: string | null
	score: number | null
	scored_by: number | null
	rank: number | null
	popularity: number | null
	members: number | null
	favorites: number | null
	images: AnimeJikanImages | null
	trailer: AnimeJikanTrailer | null
	genres: AnimeJikanGenre[]
	studios: AnimeJikanStudio[]
	external: AnimeJikanNamedLink[]
	streaming: AnimeJikanNamedLink[]
	relations: AnimeJikanRelation[]
}

export interface JikanAnimeVideos {
	promo: AnimeJikanPromo[]
}

const defaultHeaders = {
	'user-agent':
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36 anime-scraper-engine/0.1',
	accept: 'application/json',
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransientError = (error: unknown) => {
	if (!(error instanceof Error)) return false
	return error.name === 'TimeoutError' || error.name === 'AbortError'
}

const isTransientStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500

const createUrl = (baseUrl: string, path: string, params?: Record<string, string | number>) => {
	const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
	const url = new URL(path.replace(/^\//, ''), normalizedBase)
	for (const [key, value] of Object.entries(params ?? {})) {
		url.searchParams.set(key, String(value))
	}
	return url.toString()
}

export class JikanClient {
	constructor(
		private readonly config: JikanClientConfig,
		private readonly fetchImpl: FetchLike = defaultFetch
	) {}

	private async request<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
		const attempts = Math.max(1, this.config.requestRetryAttempts + 1)
		const url = createUrl(this.config.jikanBaseUrl, path, params)

		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			try {
				const response = await this.fetchImpl(url, {
					headers: defaultHeaders,
					signal: AbortSignal.timeout(this.config.requestTimeoutMs),
				})

				if (response.ok) {
					const payload = (await response.json()) as JikanEnvelope<T>
					return payload.data ?? null
				}

				let bodyPreview = ''
				try {
					bodyPreview = (await response.text()).slice(0, 300)
				} catch {
					bodyPreview = ''
				}

				this.config.onLog?.('warn', 'jikan.request.non_ok', {
					path,
					url,
					status: response.status,
					attempt,
					bodyPreview,
				})

				if (!isTransientStatus(response.status)) {
					return null
				}
			} catch (error) {
				this.config.onLog?.('warn', 'jikan.request.error', {
					path,
					url,
					attempt,
					error: error instanceof Error ? error.message : String(error),
				})

				if (!isTransientError(error)) {
					return null
				}
			}

			if (attempt < attempts) {
				await sleep(250 * attempt)
			}
		}

		return null
	}

	async searchAnime(query: string, limit = 10): Promise<JikanAnimeSearchResult[]> {
		const data = await this.request<JikanAnimeSearchResult[]>('anime', { q: query, limit })
		const results = data ?? []
		if (results.length === 0) {
			this.config.onLog?.('info', 'jikan.search.empty', {
				query,
				limit,
			})
		}
		return results
	}

	async getAnimeFull(malId: number): Promise<JikanAnimeFull | null> {
		return this.request<JikanAnimeFull>(`anime/${malId}/full`)
	}

	async getAnimeVideos(malId: number): Promise<JikanAnimeVideos | null> {
		return this.request<JikanAnimeVideos>(`anime/${malId}/videos`)
	}
}
