import type { AppConfig } from "../config";
import type { PersistentCacheStore } from "../http/persistentCache";
import type { RequestCoordinator } from "../http/requestCoordinator";
import { isAnimeAv1BaseUrl } from "../utils/animeSeed";

export interface PageLoader {
	getPath(path: string): Promise<string | null>;
	getHomepage(): Promise<string | null>;
	getAnimePage(animeId: string): Promise<string | null>;
	getEpisodePage(episodeId: string): Promise<string | null>;
	getDirectoryPage(page: number): Promise<string | null>;
	getTopRatedPage(): Promise<string | null>;
}

type LoggerLike = {
	warn?: (message: string, meta?: unknown) => void;
};

const htmlHeaders = {
	"user-agent":
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36 anime-scraper-engine/0.1",
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const cacheNamespaceForBaseUrl = (baseUrl: string) => {
	try {
		const url = new URL(baseUrl);
		return encodeURIComponent(url.origin.toLowerCase());
	} catch {
		return encodeURIComponent(baseUrl.toLowerCase());
	}
};

const buildUrl = (baseUrl: string, path: string) =>
	`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

export class AnimeFlvPageLoader implements PageLoader {
	constructor(
		private readonly config: AppConfig,
		private readonly coordinator: RequestCoordinator,
	) {}

	getPath(path: string): Promise<string | null> {
		return this.coordinator.requestText(buildUrl(this.config.animeFlvBaseUrl, path), undefined, {
			// Include the source origin so a migration cannot reuse persisted HTML
			// from the previous AnimeFLV host for the same path.
			cacheKey: `animeflv:${cacheNamespaceForBaseUrl(this.config.animeFlvBaseUrl)}:path:${path}`,
			cacheScope: "persistent",
			ttlMs: ttlForPath(path),
			staleWhileRevalidateMs: staleTtlForPath(path),
			retryAttempts: this.config.requestRetryAttempts,
			timeoutMs: this.config.requestTimeoutMs,
			headers: htmlHeaders,
			meta: { path },
		});
	}

	getHomepage() {
		return this.getPath("/");
	}


	getAnimePage(animeId: string) {
		return this.getPath(isAnimeAv1BaseUrl(this.config.animeFlvBaseUrl) ? `/media/${animeId}` : `/anime/${animeId}`);
	}

	getEpisodePage(episodeId: string) {
		if (!isAnimeAv1BaseUrl(this.config.animeFlvBaseUrl)) return this.getPath(`/ver/${episodeId}`);
		const match = episodeId.match(/^(.+)-(\d+)$/);
		return this.getPath(match ? `/media/${match[1]}/${match[2]}` : `/media/${episodeId}`);
	}

	getDirectoryPage(page: number) {
		return this.getPath(isAnimeAv1BaseUrl(this.config.animeFlvBaseUrl) ? `/catalogo?page=${page}` : `/browse?page=${page}`);
	}

	getTopRatedPage() {
		return this.getPath(isAnimeAv1BaseUrl(this.config.animeFlvBaseUrl) ? "/catalogo?order=score" : "/browse?status=1&order=rating");
	}
}

type JikanMatchRecord = {
	animeId: string;
	malId: number;
	matchedQuery: string;
	matchedTitle: string;
	matchScore: number;
	storedAt: string;
};

export class JikanMatchLoader {
	constructor(
		private readonly options: {
			cacheStore?: PersistentCacheStore | null;
			logger?: LoggerLike;
		},
	) {}

	async get(animeId: string): Promise<JikanMatchRecord | null> {
		if (!this.options.cacheStore) return null;

		try {
			const entry = await this.options.cacheStore.get(matchKey(animeId));
			if (!entry) return null;
			const parsed = JSON.parse(entry.body) as JikanMatchRecord;
			if (!parsed?.animeId || typeof parsed.malId !== "number") return null;
			return parsed;
		} catch (error) {
			this.options.logger?.warn?.("jikan_match_cache.read_failed", {
				animeId,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	async set(record: {
		animeId: string;
		malId: number;
		matchedQuery: string;
		matchedTitle: string;
		matchScore: number;
	}): Promise<void> {
		if (!this.options.cacheStore) return;

		const storedAt = new Date().toISOString();
		const body = JSON.stringify({ ...record, storedAt });

		try {
			await this.options.cacheStore.set(
				{
					key: matchKey(record.animeId),
					contentType: "application/json",
					encoding: "utf8",
					body,
					storedAt,
					expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
					staleUntilAt: null,
					meta: { animeId: record.animeId, malId: record.malId },
				},
				{ ttlMs: 30 * 24 * 60 * 60 * 1000 },
			);
		} catch (error) {
			this.options.logger?.warn?.("jikan_match_cache.write_failed", {
				animeId: record.animeId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

const matchKey = (animeId: string) => `jikan:match:${animeId}`;

const ttlForPath = (path: string) => {
	if (path === "/") return 5 * 60 * 1000;
	if (path.startsWith("/ver/") || /^\/media\/[^/]+\/\d+/.test(path)) return 10 * 60 * 1000;
	if (path.startsWith("/anime/") || path.startsWith("/media/")) return 60 * 60 * 1000;
	return 30 * 60 * 1000;
};

const staleTtlForPath = (path: string) => {
	if (path === "/") return 60 * 1000;
	if (path.startsWith("/ver/") || /^\/media\/[^/]+\/\d+/.test(path)) return 5 * 60 * 1000;
	return 10 * 60 * 1000;
};
