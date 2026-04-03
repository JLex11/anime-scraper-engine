import type { AppConfig } from '../config'

const defaultHeaders = {
	'user-agent':
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36 anime-scraper-engine/0.1',
	accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransientError = (error: unknown) => {
	if (!(error instanceof Error)) return false
	return error.name === 'TimeoutError' || error.name === 'AbortError'
}

const isTransientStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500

export const fetchAnimeFlvHtml = async (appConfig: AppConfig, path: string): Promise<string | null> => {
	const url = `${appConfig.animeFlvBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
	const attempts = Math.max(1, appConfig.requestRetryAttempts + 1)

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await fetch(url, {
				headers: defaultHeaders,
				signal: AbortSignal.timeout(appConfig.requestTimeoutMs),
			})

			if (response.ok) {
				return response.text()
			}

			if (!isTransientStatus(response.status)) {
				return null
			}
		} catch (error) {
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
