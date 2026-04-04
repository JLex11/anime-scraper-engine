import type {
	AnimeJikanGenre,
	AnimeJikanImages,
	AnimeJikanNamedLink,
	AnimeJikanPromo,
	AnimeJikanRelation,
	AnimeJikanStudio,
	AnimeJikanTitle,
	AnimeJikanTrailer,
} from "../types/models";
import {
	RequestCoordinator,
	type FetchLike,
} from "../http/requestCoordinator";

type JikanClientConfig = {
	jikanBaseUrl: string;
	requestTimeoutMs: number;
	requestRetryAttempts: number;
	onLog?: (level: "info" | "warn", message: string, meta?: unknown) => void;
};

type JikanEnvelope<T> = {
	data?: T;
};

export interface JikanAnimeSearchResult {
	mal_id: number;
	url: string | null;
	title: string;
	title_english: string | null;
	title_japanese: string | null;
	titles: AnimeJikanTitle[];
	type: string | null;
	year: number | null;
	episodes: number | null;
	images: AnimeJikanImages | null;
}

export interface JikanAnimeFull {
	mal_id: number;
	url: string | null;
	title: string;
	title_english: string | null;
	title_japanese: string | null;
	titles: AnimeJikanTitle[];
	synopsis: string | null;
	background: string | null;
	type: string | null;
	status: string | null;
	rating: string | null;
	source: string | null;
	season: string | null;
	year: number | null;
	episodes: number | null;
	duration: string | null;
	score: number | null;
	scored_by: number | null;
	rank: number | null;
	popularity: number | null;
	members: number | null;
	favorites: number | null;
	images: AnimeJikanImages | null;
	trailer: AnimeJikanTrailer | null;
	genres: AnimeJikanGenre[];
	studios: AnimeJikanStudio[];
	external: AnimeJikanNamedLink[];
	streaming: AnimeJikanNamedLink[];
	relations: AnimeJikanRelation[];
}

export interface JikanAnimeVideos {
	promo: AnimeJikanPromo[];
}

const defaultHeaders = {
	"user-agent":
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36 anime-scraper-engine/0.1",
	accept: "application/json",
};

const createUrl = (
	baseUrl: string,
	path: string,
	params?: Record<string, string | number>,
) => {
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
	const url = new URL(path.replace(/^\//, ""), normalizedBase);
	for (const [key, value] of Object.entries(params ?? {})) {
		url.searchParams.set(key, String(value));
	}
	return url.toString();
};

export class JikanClient {
	private readonly requestCoordinator: RequestCoordinator;

	constructor(
		private readonly config: JikanClientConfig,
		requestOrFetch?: FetchLike | RequestCoordinator,
		requestCoordinator?: RequestCoordinator,
	) {
		if (
			requestOrFetch &&
			typeof requestOrFetch === "object" &&
			"requestJson" in requestOrFetch
		) {
			this.requestCoordinator = requestOrFetch as RequestCoordinator;
			return;
		}

		this.requestCoordinator =
			requestCoordinator ??
			new RequestCoordinator({
				defaultTimeoutMs: config.requestTimeoutMs,
				defaultRetryAttempts: config.requestRetryAttempts,
				fetchImpl: requestOrFetch as FetchLike | undefined,
			});
	}

	private async request<T>(
		path: string,
		params?: Record<string, string | number>,
	): Promise<T | null> {
		const url = createUrl(this.config.jikanBaseUrl, path, params);
		return this.requestCoordinator.requestJson<JikanEnvelope<T>>(
			url,
			{ headers: defaultHeaders },
			{
				cacheKey: `jikan:${path}:${JSON.stringify(params ?? {})}`,
				ttlMs: 24 * 60 * 60 * 1000,
				staleWhileRevalidateMs: 30 * 60 * 1000,
				cacheScope: "persistent",
				dedupe: true,
				retryAttempts: this.config.requestRetryAttempts,
				timeoutMs: this.config.requestTimeoutMs,
				meta: { path, params: params ?? null },
			},
		).then((payload) => payload?.data ?? null);
	}

	async searchAnime(query: string, limit = 10): Promise<JikanAnimeSearchResult[]> {
		const data = await this.request<JikanAnimeSearchResult[]>("anime", {
			q: query,
			limit,
		});
		const results = data ?? [];
		if (results.length === 0) {
			this.config.onLog?.("info", "jikan.search.empty", {
				query,
				limit,
			});
		}
		return results;
	}

	async getAnimeFull(malId: number): Promise<JikanAnimeFull | null> {
		return this.request<JikanAnimeFull>(`anime/${malId}/full`);
	}

	async getAnimeVideos(malId: number): Promise<JikanAnimeVideos | null> {
		return this.request<JikanAnimeVideos>(`anime/${malId}/videos`);
	}
}
