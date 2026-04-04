import type { AppConfig } from "../src/config";
import type { PipelineContext } from "../src/pipelines/context";
import type {
	AnimeCarouselMeta,
	AnimeDetail,
	AnimeJikanDetail,
	AnimeJikanRefreshMeta,
	AnimeSeedRecord,
	EpisodeDetail,
	EpisodeSourcesRecord,
	SyncStateMeta,
	SyncStateUpsertInput,
} from "../src/types/models";

export type WriterSpy = {
	animeFeedItems: Array<{ feedType: string; animeIds: string[]; page: number }>;
	episodeFeedItems: Array<{ feedType: string; episodeIds: string[] }>;
	animeDetails: AnimeDetail[];
	animeJikanDetails: AnimeJikanDetail[];
	animeSeedRecords: AnimeSeedRecord[][];
	episodes: EpisodeDetail[][];
	episodeSources: EpisodeSourcesRecord[];
	syncStates: Array<{
		resourceType: string;
		resourceId: string;
		status: "success" | "error";
		errorMessage?: string;
	}>;
	fullSyncStates: SyncStateUpsertInput[];
	updatedCarousels: Array<{
		animeId: string;
		images: AnimeDetail["images"];
		carouselImageKeys: string[];
	}>;
	animeCarouselMetaById: Map<string, AnimeCarouselMeta>;
	syncStateMetaByResource: Map<string, SyncStateMeta>;
	writer: PipelineContext["writer"];
};

export type LoggerSpy = {
	warns: Array<{ message: string; meta?: unknown }>;
	logger: PipelineContext["logger"];
};

export const createConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
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
	...overrides,
});

export const createWriterSpy = (): WriterSpy => {
	const animeFeedItems: WriterSpy["animeFeedItems"] = [];
	const episodeFeedItems: WriterSpy["episodeFeedItems"] = [];
	const animeDetails: AnimeDetail[] = [];
	const animeJikanDetails: AnimeJikanDetail[] = [];
	const animeSeedRecords: AnimeSeedRecord[][] = [];
	const episodes: EpisodeDetail[][] = [];
	const episodeSources: EpisodeSourcesRecord[] = [];
	const syncStates: WriterSpy["syncStates"] = [];
	const fullSyncStates: WriterSpy["fullSyncStates"] = [];
	const updatedCarousels: WriterSpy["updatedCarousels"] = [];
	const animeCarouselMetaById: WriterSpy["animeCarouselMetaById"] = new Map();
	const syncStateMetaByResource: WriterSpy["syncStateMetaByResource"] =
		new Map();

	return {
		animeFeedItems,
		episodeFeedItems,
		animeDetails,
		animeJikanDetails,
		animeSeedRecords,
		episodes,
		episodeSources,
		syncStates,
		fullSyncStates,
		updatedCarousels,
		animeCarouselMetaById,
		syncStateMetaByResource,
		writer: (() => {
			const writer: Record<string, unknown> = {
			upsertAnimeFeedItems: async (
				feedType: string,
				animeIds: string[],
				page = 1,
			) => {
				animeFeedItems.push({ feedType, animeIds, page });
			},
			upsertEpisodeFeedItems: async (
				feedType: string,
				episodeIds: string[],
			) => {
				episodeFeedItems.push({ feedType, episodeIds });
			},
			upsertAnimeDetails: async (detail: AnimeDetail) => {
				animeDetails.push(detail);
			},
			upsertAnimeJikanDetail: async (detail: AnimeJikanDetail) => {
				animeJikanDetails.push(detail);
			},
			ensureAnimeRecords: async (records: AnimeSeedRecord[]) => {
				animeSeedRecords.push(records);
			},
			upsertEpisodes: async (records: EpisodeDetail[]) => {
				episodes.push(records);
			},
			upsertEpisodeSources: async (record: EpisodeSourcesRecord) => {
				episodeSources.push(record);
			},
			upsertEpisodeSourcesBatch: async (records: EpisodeSourcesRecord[]) => {
				episodeSources.push(...records);
			},
			markSyncState: async (
				resourceType: string,
				resourceId: string,
				status: "success" | "error",
				errorMessage?: string,
			) => {
				syncStates.push({ resourceType, resourceId, status, errorMessage });
			},
			upsertSyncState: async (input: SyncStateUpsertInput) => {
				fullSyncStates.push(input);
				if (input.status === "success" || input.status === "error") {
					syncStates.push({
						resourceType: input.resourceType,
						resourceId: input.resourceId,
						status: input.status,
						errorMessage: input.errorMessage ?? undefined,
					});
				}
				syncStateMetaByResource.set(
					`${input.resourceType}:${input.resourceId}`,
					{
						resourceType: input.resourceType,
						resourceId: input.resourceId,
						status: input.status,
						lastSuccessAt: input.lastSuccessAt ?? null,
						lastErrorAt: input.lastErrorAt ?? null,
						errorCount: input.errorCount ?? 0,
						errorMessage: input.errorMessage ?? null,
						nextRunAt: input.nextRunAt ?? null,
					},
				);
			},
			upsertSyncStates: async (inputs: SyncStateUpsertInput[]) => {
				for (const input of inputs) {
					fullSyncStates.push(input);
					if (input.status === "success" || input.status === "error") {
						syncStates.push({
							resourceType: input.resourceType,
							resourceId: input.resourceId,
							status: input.status,
							errorMessage: input.errorMessage ?? undefined,
						});
					}
					syncStateMetaByResource.set(
						`${input.resourceType}:${input.resourceId}`,
						{
							resourceType: input.resourceType,
							resourceId: input.resourceId,
							status: input.status,
							lastSuccessAt: input.lastSuccessAt ?? null,
							lastErrorAt: input.lastErrorAt ?? null,
							errorCount: input.errorCount ?? 0,
							errorMessage: input.errorMessage ?? null,
							nextRunAt: input.nextRunAt ?? null,
						},
					);
				}
			},
			getSyncState: async (
				resourceType: string,
				resourceId: string,
			): Promise<SyncStateMeta | null> => {
				return (
					syncStateMetaByResource.get(`${resourceType}:${resourceId}`) ?? null
				);
			},
			getSyncStates: async (
				resourceType: string,
				resourceIds: string[],
			): Promise<Map<string, SyncStateMeta>> =>
				new Map(
					resourceIds
						.map((resourceId) => [
							resourceId,
							syncStateMetaByResource.get(`${resourceType}:${resourceId}`) ?? null,
						])
						.filter((entry): entry is [string, SyncStateMeta] => entry[1] !== null),
				),
			getAnimeCarouselMeta: async (
				animeId: string,
			): Promise<AnimeCarouselMeta | null> => {
				return animeCarouselMetaById.get(animeId) ?? null;
			},
			getAnimeCarouselMetas: async (
				animeIds: string[],
			): Promise<Map<string, AnimeCarouselMeta>> =>
				new Map(
					animeIds
						.map((animeId) => [animeId, animeCarouselMetaById.get(animeId) ?? null])
						.filter((entry): entry is [string, AnimeCarouselMeta] => entry[1] !== null),
				),
			updateAnimeCarouselImages: async (
				animeId: string,
				images: AnimeDetail["images"],
				carouselImageKeys: string[],
			) => {
				updatedCarousels.push({ animeId, images, carouselImageKeys });
			},
			getAnimeIdsFromFeed: async () => [],
			getAnimeJikanRefreshMeta:
				async (): Promise<AnimeJikanRefreshMeta | null> => null,
			getAnimeJikanRefreshMetas: async (
				animeIds: string[],
			): Promise<Map<string, AnimeJikanRefreshMeta>> =>
				new Map(
					(
						await Promise.all(
							animeIds.map(async (animeId) => [
								animeId,
								await (writer.getAnimeJikanRefreshMeta as (
									animeId: string,
								) => Promise<AnimeJikanRefreshMeta | null>)(animeId),
							] as const),
						)
					).filter(
						(entry): entry is [string, AnimeJikanRefreshMeta] => entry[1] !== null,
					),
				),
			getRecentEpisodeIds: async () => [],
			getMaxEpisodeNumberByAnimeId: async () => 0,
			getMaxEpisodeNumbersByAnimeIds: async (
				animeIds: string[],
			): Promise<Map<string, number>> =>
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

		return writer as unknown as PipelineContext["writer"];
		})(),
	};
};

export const createLoggerSpy = (): LoggerSpy => {
	const warns: LoggerSpy["warns"] = [];

	return {
		warns,
		logger: {
			warn: (message: string, meta?: unknown) => {
				warns.push({ message, meta });
			},
		} as unknown as PipelineContext["logger"],
	};
};

export const createPipelineContext = (
	options: {
		htmlByPath?: Record<string, string | null>;
		fetchHtml?: PipelineContext["fetchHtml"];
		writer?: PipelineContext["writer"];
		logger?: PipelineContext["logger"];
		r2Writer?: PipelineContext["r2Writer"];
		jikanClient?: PipelineContext["jikanClient"];
		googleSearchClient?: PipelineContext["googleSearchClient"];
		config?: Partial<AppConfig>;
	} = {},
): PipelineContext => {
	const fetchHtml =
		options.fetchHtml ??
		(async (path: string) => {
			return options.htmlByPath?.[path] ?? null;
		});

	return {
		config: createConfig(options.config),
		writer: options.writer ?? createWriterSpy().writer,
		logger: options.logger ?? createLoggerSpy().logger,
		r2Writer: options.r2Writer,
		jikanClient:
			options.jikanClient ??
			({
				searchAnime: async () => [],
				getAnimeFull: async () => null,
				getAnimeVideos: async () => null,
			} as unknown as PipelineContext["jikanClient"]),
		googleSearchClient:
			options.googleSearchClient ??
			({
				searchImageBanners: async () => [],
			} as unknown as PipelineContext["googleSearchClient"]),
		jikanMatchLoader: {
			get: async () => null,
			set: async () => {},
		} as unknown as PipelineContext["jikanMatchLoader"],
		fetchHtml,
	};
};
