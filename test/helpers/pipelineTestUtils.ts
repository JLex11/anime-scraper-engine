import type { AppConfig } from '../../src/config'
import type { PipelineContext } from '../../src/pipelines/context'
import type { AnimeDetail, EpisodeDetail, EpisodeSourcesRecord } from '../../src/types/models'

export type SyncStateCall = {
	resourceType: string
	resourceId: string
	status: 'success' | 'error'
	errorMessage?: string
}

export type AnimeFeedCall = {
	feedType: 'directory' | 'latest' | 'broadcast' | 'rating'
	animeIds: string[]
	page?: number
}

export type EpisodeFeedCall = {
	feedType: 'latest'
	episodeIds: string[]
}

export type LoggerWarnCall = {
	message: string
	meta?: unknown
}

export const createTestConfig = (): AppConfig => ({
	supabaseUrl: '',
	supabaseServiceRoleKey: '',
	animeFlvBaseUrl: 'https://example.test',
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
})

export const createPipelineContextMock = (overrides?: {
	config?: Partial<AppConfig>
	fetchHtml?: PipelineContext['fetchHtml']
	r2Writer?: PipelineContext['r2Writer']
}) => {
	const calls = {
		animeFeedItems: [] as AnimeFeedCall[],
		episodeFeedItems: [] as EpisodeFeedCall[],
		animeDetails: [] as AnimeDetail[],
		episodes: [] as EpisodeDetail[][],
		episodeSources: [] as EpisodeSourcesRecord[],
		syncStates: [] as SyncStateCall[],
		warns: [] as LoggerWarnCall[],
	}

	const writer = {
		upsertAnimeFeedItems: async (feedType: AnimeFeedCall['feedType'], animeIds: string[], page?: number) => {
			calls.animeFeedItems.push({ feedType, animeIds, page })
		},
		upsertEpisodeFeedItems: async (feedType: EpisodeFeedCall['feedType'], episodeIds: string[]) => {
			calls.episodeFeedItems.push({ feedType, episodeIds })
		},
		upsertAnimeDetails: async (detail: AnimeDetail) => {
			calls.animeDetails.push(detail)
		},
		upsertEpisodes: async (episodes: EpisodeDetail[]) => {
			calls.episodes.push(episodes)
		},
		upsertEpisodeSources: async (record: EpisodeSourcesRecord) => {
			calls.episodeSources.push(record)
		},
		markSyncState: async (
			resourceType: string,
			resourceId: string,
			status: 'success' | 'error',
			errorMessage?: string
		) => {
			calls.syncStates.push({ resourceType, resourceId, status, errorMessage })
		},
		getAnimeIdsFromFeed: async () => [],
		getRecentEpisodeIds: async () => [],
		getMaxEpisodeNumberByAnimeId: async () => 0,
		getEpisodeIdsNeedingSourceRefresh: async () => [],
	}

	const logger = {
		debug: () => {},
		info: () => {},
		warn: (message: string, meta?: unknown) => {
			calls.warns.push({ message, meta })
		},
		error: () => {},
	}

	const ctx: PipelineContext = {
		config: { ...createTestConfig(), ...overrides?.config },
		writer: writer as unknown as PipelineContext['writer'],
		logger: logger as unknown as PipelineContext['logger'],
		r2Writer: overrides?.r2Writer,
		fetchHtml: overrides?.fetchHtml ?? (async () => null),
	}

	return { ctx, calls }
}
