import type { AppConfig } from '../src/config'
import type { PipelineContext } from '../src/pipelines/context'
import type {
	AnimeDetail,
	AnimeJikanDetail,
	AnimeJikanRefreshMeta,
	AnimeSeedRecord,
	EpisodeDetail,
	EpisodeSourcesRecord,
} from '../src/types/models'

export type WriterSpy = {
	animeFeedItems: Array<{ feedType: string; animeIds: string[]; page: number }>
	episodeFeedItems: Array<{ feedType: string; episodeIds: string[] }>
	animeDetails: AnimeDetail[]
	animeJikanDetails: AnimeJikanDetail[]
	animeSeedRecords: AnimeSeedRecord[][]
	episodes: EpisodeDetail[][]
	episodeSources: EpisodeSourcesRecord[]
	syncStates: Array<{ resourceType: string; resourceId: string; status: 'success' | 'error'; errorMessage?: string }>
	writer: PipelineContext['writer']
}

export type LoggerSpy = {
	warns: Array<{ message: string; meta?: unknown }>
	logger: PipelineContext['logger']
}

export const createConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
	supabaseUrl: '',
	supabaseServiceRoleKey: '',
	animeFlvBaseUrl: 'https://example.test',
	jikanBaseUrl: 'https://api.jikan.test/v4',
	requestTimeoutMs: 1000,
	requestRetryAttempts: 1,
	maxConcurrency: 2,
	logLevel: 'info',
	runOnce: true,
	manualRunToken: '',
	r2AccountId: '',
	r2AccessKeyId: '',
	r2SecretAccessKey: '',
	r2Bucket: '',
	r2PublicBaseUrl: '',
	r2BucketBinding: '',
	...overrides,
})

export const createWriterSpy = (): WriterSpy => {
	const animeFeedItems: WriterSpy['animeFeedItems'] = []
	const episodeFeedItems: WriterSpy['episodeFeedItems'] = []
	const animeDetails: AnimeDetail[] = []
	const animeJikanDetails: AnimeJikanDetail[] = []
	const animeSeedRecords: AnimeSeedRecord[][] = []
	const episodes: EpisodeDetail[][] = []
	const episodeSources: EpisodeSourcesRecord[] = []
	const syncStates: WriterSpy['syncStates'] = []

	return {
		animeFeedItems,
		episodeFeedItems,
		animeDetails,
		animeJikanDetails,
		animeSeedRecords,
		episodes,
		episodeSources,
		syncStates,
		writer: {
			upsertAnimeFeedItems: async (feedType: string, animeIds: string[], page = 1) => {
				animeFeedItems.push({ feedType, animeIds, page })
			},
			upsertEpisodeFeedItems: async (feedType: string, episodeIds: string[]) => {
				episodeFeedItems.push({ feedType, episodeIds })
			},
			upsertAnimeDetails: async (detail: AnimeDetail) => {
				animeDetails.push(detail)
			},
			upsertAnimeJikanDetail: async (detail: AnimeJikanDetail) => {
				animeJikanDetails.push(detail)
			},
			ensureAnimeRecords: async (records: AnimeSeedRecord[]) => {
				animeSeedRecords.push(records)
			},
			upsertEpisodes: async (records: EpisodeDetail[]) => {
				episodes.push(records)
			},
			upsertEpisodeSources: async (record: EpisodeSourcesRecord) => {
				episodeSources.push(record)
			},
			markSyncState: async (
				resourceType: string,
				resourceId: string,
				status: 'success' | 'error',
				errorMessage?: string
			) => {
				syncStates.push({ resourceType, resourceId, status, errorMessage })
			},
			getAnimeIdsFromFeed: async () => [],
			getAnimeJikanRefreshMeta: async (): Promise<AnimeJikanRefreshMeta | null> => null,
			getRecentEpisodeIds: async () => [],
			getMaxEpisodeNumberByAnimeId: async () => 0,
			getEpisodeIdsNeedingSourceRefresh: async () => [],
		} as unknown as PipelineContext['writer'],
	}
}

export const createLoggerSpy = (): LoggerSpy => {
	const warns: LoggerSpy['warns'] = []

	return {
		warns,
		logger: {
			warn: (message: string, meta?: unknown) => {
				warns.push({ message, meta })
			},
		} as unknown as PipelineContext['logger'],
	}
}

export const createPipelineContext = (options: {
	htmlByPath?: Record<string, string | null>
	fetchHtml?: PipelineContext['fetchHtml']
	writer?: PipelineContext['writer']
	logger?: PipelineContext['logger']
	r2Writer?: PipelineContext['r2Writer']
	jikanClient?: PipelineContext['jikanClient']
	config?: Partial<AppConfig>
} = {}): PipelineContext => {
	const fetchHtml =
		options.fetchHtml ??
		(async (path: string) => {
			return options.htmlByPath?.[path] ?? null
		})

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
			} as unknown as PipelineContext['jikanClient']),
		fetchHtml,
	}
}
