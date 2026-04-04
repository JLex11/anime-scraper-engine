import type { AppConfig } from "../config";
import { RequestCoordinator } from "../http/requestCoordinator";

const defaultHeaders = {
	"user-agent":
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36 anime-scraper-engine/0.1",
	accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export class AnimeFlvClient {
	constructor(
		private readonly config: AppConfig,
		private readonly requestCoordinator: RequestCoordinator,
	) {}

	async fetchHtml(path: string, cacheKey?: string, ttlMs?: number) {
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;
		const url = `${this.config.animeFlvBaseUrl}${normalizedPath}`;

		return this.requestCoordinator.requestText(
			url,
			{ headers: defaultHeaders },
			{
				cacheKey: cacheKey ?? `animeflv:${normalizedPath}`,
				ttlMs,
				cacheScope: ttlMs ? "persistent" : "memory",
				dedupe: true,
			},
		);
	}
}

export const fetchAnimeFlvHtml = async (
	appConfig: AppConfig,
	path: string,
	requestCoordinator?: RequestCoordinator,
): Promise<string | null> => {
	const coordinator =
		requestCoordinator ??
		new RequestCoordinator({
			defaultTimeoutMs: appConfig.requestTimeoutMs,
			defaultRetryAttempts: appConfig.requestRetryAttempts,
		});

	return new AnimeFlvClient(appConfig, coordinator).fetchHtml(path);
};
