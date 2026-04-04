import type { AppConfig } from "../../src/config";
import type { PipelineContext } from "../../src/pipelines/context";
import type {
	AnimeDetail,
	AnimeJikanDetail,
	AnimeJikanRefreshMeta,
	AnimeSeedRecord,
	EpisodeDetail,
	EpisodeSourcesRecord,
} from "../../src/types/models";

export type SyncStateCall = {
	resourceType: string;
	resourceId: string;
	status: "success" | "error";
	errorMessage?: string;
};

export type AnimeFeedCall = {
	feedType: "directory" | "latest" | "broadcast" | "rating";
	animeIds: string[];
	page?: number;
};

export type EpisodeFeedCall = {
	feedType: "latest";
	episodeIds: string[];
};

export type LoggerWarnCall = {
	message: string;
	meta?: unknown;
};

export const createTestConfig = (): AppConfig => ({
	supabaseUrl: "",
	supabaseServiceRoleKey: "",
	animeFlvBaseUrl: "https://example.test",
	jikanBaseUrl: "https://api.jikan.test/v4",
	requestTimeoutMs: 1000,
	requestRetryAttempts: 1,
	maxConcurrency: 2,
	logLevel: "info",
	runOnce: true,
	manualRunToken: "",
	r2AccountId: "",
	r2AccessKeyId: "",
	r2SecretAccessKey: "",
	r2Bucket: "",
	r2PublicBaseUrl: "",
	r2BucketBinding: "",
	scraperCacheBinding: "SCRAPER_CACHE",
	googleCseApiKey: "",
	googleCseCx: "",
	googleCseBaseUrl: "https://www.googleapis.com/customsearch/v1",
});

export const createPipelineContextMock = (overrides?: {
	config?: Partial<AppConfig>;
	fetchHtml?: PipelineContext["fetchHtml"];
	r2Writer?: PipelineContext["r2Writer"];
	jikanClient?: PipelineContext["jikanClient"];
	googleSearchClient?: PipelineContext["googleSearchClient"];
}) => {
	const calls = {
		animeFeedItems: [] as AnimeFeedCall[],
		episodeFeedItems: [] as EpisodeFeedCall[],
		animeDetails: [] as AnimeDetail[],
		animeJikanDetails: [] as AnimeJikanDetail[],
		animeSeedRecords: [] as AnimeSeedRecord[][],
		episodes: [] as EpisodeDetail[][],
		episodeSources: [] as EpisodeSourcesRecord[],
		syncStates: [] as SyncStateCall[],
		warns: [] as LoggerWarnCall[],
	};

	const writer: Record<string, unknown> = {
		upsertAnimeFeedItems: async (
			feedType: AnimeFeedCall["feedType"],
			animeIds: string[],
			page?: number,
		) => {
			calls.animeFeedItems.push({ feedType, animeIds, page });
		},
		upsertEpisodeFeedItems: async (
			feedType: EpisodeFeedCall["feedType"],
			episodeIds: string[],
		) => {
			calls.episodeFeedItems.push({ feedType, episodeIds });
		},
		upsertAnimeDetails: async (detail: AnimeDetail) => {
			calls.animeDetails.push(detail);
		},
		upsertAnimeJikanDetail: async (detail: AnimeJikanDetail) => {
			calls.animeJikanDetails.push(detail);
		},
		ensureAnimeRecords: async (records: AnimeSeedRecord[]) => {
			calls.animeSeedRecords.push(records);
		},
		upsertEpisodes: async (episodes: EpisodeDetail[]) => {
			calls.episodes.push(episodes);
		},
		upsertEpisodeSources: async (record: EpisodeSourcesRecord) => {
			calls.episodeSources.push(record);
		},
		upsertEpisodeSourcesBatch: async (records: EpisodeSourcesRecord[]) => {
			calls.episodeSources.push(...records);
		},
		markSyncState: async (
			resourceType: string,
			resourceId: string,
			status: "success" | "error",
			errorMessage?: string,
		) => {
			calls.syncStates.push({ resourceType, resourceId, status, errorMessage });
		},
		upsertSyncState: async () => {},
		upsertSyncStates: async (inputs: Array<{
			resourceType: string;
			resourceId: string;
			status: "pending" | "running" | "success" | "error";
			errorMessage?: string | null;
		}>) => {
			for (const input of inputs) {
				calls.syncStates.push({
					resourceType: input.resourceType,
					resourceId: input.resourceId,
					status:
						input.status === "success" || input.status === "error"
							? input.status
							: "error",
					errorMessage: input.errorMessage ?? undefined,
				});
			}
		},
		getSyncState: async () => null,
		getSyncStates: async (_resourceType: string, resourceIds: string[]) =>
			new Map(resourceIds.map((resourceId) => [resourceId, null]).filter((entry): entry is [string, never] => entry[1] !== null)),
		getAnimeCarouselMeta: async () => null,
		getAnimeCarouselMetas: async (animeIds: string[]) =>
			new Map(animeIds.map((animeId) => [animeId, null]).filter((entry): entry is [string, never] => entry[1] !== null)),
		updateAnimeCarouselImages: async () => {},
		getAnimeIdsFromFeed: async () => [],
		getAnimeJikanRefreshMeta: async (): Promise<AnimeJikanRefreshMeta | null> =>
			null,
		getAnimeJikanRefreshMetas: async (animeIds: string[]) =>
			new Map(
				(
					await Promise.all(
						animeIds.map(async (animeId) => [
							animeId,
							await (writer.getAnimeJikanRefreshMeta as (
								animeId: string,
							) => Promise<AnimeJikanRefreshMeta | null>)(animeId),
						]),
					)
				).filter(
					(entry): entry is [string, AnimeJikanRefreshMeta] => entry[1] !== null,
				),
			),
		getRecentEpisodeIds: async () => [],
		getMaxEpisodeNumberByAnimeId: async () => 0,
		getMaxEpisodeNumbersByAnimeIds: async (animeIds: string[]) =>
			new Map(
				await Promise.all(
					animeIds.map(async (animeId) => [
						animeId,
						await (writer.getMaxEpisodeNumberByAnimeId as (
							animeId: string,
						) => Promise<number>)(animeId),
					] as const),
				),
			),
		getEpisodeIdsNeedingSourceRefresh: async () => [],
	};

	const logger = {
		debug: () => {},
		info: () => {},
		warn: (message: string, meta?: unknown) => {
			calls.warns.push({ message, meta });
		},
		error: () => {},
	};

	const ctx: PipelineContext = {
		config: { ...createTestConfig(), ...overrides?.config },
		writer: writer as unknown as PipelineContext["writer"],
		logger: logger as unknown as PipelineContext["logger"],
		r2Writer: overrides?.r2Writer,
		jikanClient:
			overrides?.jikanClient ??
			({
				searchAnime: async () => [],
				getAnimeFull: async () => null,
				getAnimeVideos: async () => null,
			} as unknown as PipelineContext["jikanClient"]),
		googleSearchClient:
			overrides?.googleSearchClient ??
			({
				searchImageBanners: async () => [],
			} as unknown as PipelineContext["googleSearchClient"]),
		jikanMatchLoader: {
			get: async () => null,
			set: async () => {},
		} as unknown as PipelineContext["jikanMatchLoader"],
		fetchHtml: overrides?.fetchHtml ?? (async () => null),
	};

	return { ctx, calls };
};
