import { config } from '../config'

const defaultHeaders = {
	'user-agent':
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36 anime-scraper-engine/0.1',
	accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

export const fetchAnimeFlvHtml = async (path: string): Promise<string | null> => {
	const url = `${config.animeFlvBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
	const response = await fetch(url, {
		headers: defaultHeaders,
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	})

	if (!response.ok) {
		return null
	}

	return response.text()
}
