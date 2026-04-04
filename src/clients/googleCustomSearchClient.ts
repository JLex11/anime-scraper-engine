type GoogleCustomSearchClientConfig = {
	googleCseApiKey: string;
	googleCseCx: string;
	googleCseBaseUrl: string;
	requestTimeoutMs: number;
	requestRetryAttempts: number;
	onLog?: (level: "info" | "warn", message: string, meta?: unknown) => void;
};

type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

const defaultFetch: FetchLike = (input, init) =>
	globalThis.fetch(input as RequestInfo | URL, init);

type GoogleImagePayload = {
	items?: Array<{
		link?: string;
		title?: string;
		mime?: string;
		image?: {
			width?: number | string;
			height?: number | string;
		};
	}>;
};

export interface GoogleImageSearchResult {
	link: string;
	title: string | null;
	mime: string | null;
	width: number;
	height: number;
}

const defaultHeaders = {
	"user-agent":
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36 anime-scraper-engine/0.1",
	accept: "application/json",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientError = (error: unknown) => {
	if (!(error instanceof Error)) return false;
	return error.name === "TimeoutError" || error.name === "AbortError";
};

const isTransientStatus = (status: number) =>
	status === 408 || status === 425 || status === 429 || status >= 500;

const createUrl = (
	baseUrl: string,
	params: Record<string, string | number>,
) => {
	const url = new URL(baseUrl);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, String(value));
	}
	return url.toString();
};

const asPositiveNumber = (value: unknown) => {
	const numeric = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) return 0;
	return Math.round(numeric);
};

const isAbsoluteHttpUrl = (value: string) => {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
};

export class GoogleCustomSearchClient {
	constructor(
		private readonly config: GoogleCustomSearchClientConfig,
		private readonly fetchImpl: FetchLike = defaultFetch,
	) {}

	private async request(
		params: Record<string, string | number>,
	): Promise<GoogleImagePayload | null> {
		const attempts = Math.max(1, this.config.requestRetryAttempts + 1);
		const url = createUrl(this.config.googleCseBaseUrl, params);

		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			try {
				const response = await this.fetchImpl(url, {
					headers: defaultHeaders,
					signal: AbortSignal.timeout(this.config.requestTimeoutMs),
				});

				if (response.ok) {
					return (await response.json()) as GoogleImagePayload;
				}

				let bodyPreview = "";
				try {
					bodyPreview = (await response.text()).slice(0, 300);
				} catch {
					bodyPreview = "";
				}

				this.config.onLog?.("warn", "google_cse.request.non_ok", {
					url,
					status: response.status,
					attempt,
					bodyPreview,
				});

				if (!isTransientStatus(response.status)) {
					return null;
				}
			} catch (error) {
				this.config.onLog?.("warn", "google_cse.request.error", {
					url,
					attempt,
					error: error instanceof Error ? error.message : String(error),
				});

				if (!isTransientError(error)) {
					return null;
				}
			}

			if (attempt < attempts) {
				await sleep(250 * attempt);
			}
		}

		return null;
	}

	async searchImageBanners(
		query: string,
		limit = 10,
	): Promise<GoogleImageSearchResult[]> {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) return [];
		if (!this.config.googleCseApiKey || !this.config.googleCseCx) {
			this.config.onLog?.("warn", "google_cse.search.misconfigured", {
				hasApiKey: Boolean(this.config.googleCseApiKey),
				hasCx: Boolean(this.config.googleCseCx),
			});
			return [];
		}

		const num = Math.max(1, Math.min(limit, 10));
		const payload = await this.request({
			key: this.config.googleCseApiKey,
			cx: this.config.googleCseCx,
			q: normalizedQuery,
			searchType: "image",
			num,
		});

		const results = (payload?.items ?? [])
			.map((item) => {
				const link = typeof item.link === "string" ? item.link.trim() : "";
				const width = asPositiveNumber(item.image?.width);
				const height = asPositiveNumber(item.image?.height);
				const title = typeof item.title === "string" ? item.title : null;
				const mime = typeof item.mime === "string" ? item.mime : null;

				if (!link || !isAbsoluteHttpUrl(link) || width === 0 || height === 0) {
					return null;
				}

				return {
					link,
					title,
					mime,
					width,
					height,
				} satisfies GoogleImageSearchResult;
			})
			.filter((value): value is GoogleImageSearchResult => value !== null);

		if (results.length === 0) {
			this.config.onLog?.("info", "google_cse.search.empty", {
				query: normalizedQuery,
				limit: num,
			});
		}

		return results;
	}
}
