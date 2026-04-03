import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnimeDetail, AnimeFeedType, EpisodeDetail, EpisodeFeedType, EpisodeSourcesRecord } from '../types/models'

export class SupabaseWriter {
	constructor(private readonly supabase: SupabaseClient) {}

	private async execute<T extends { error: unknown }>(operation: PromiseLike<T>, context: string): Promise<T> {
		const result = await operation
		if (result.error) {
			throw new Error(`${context}: ${String(result.error)}`)
		}
		return result
	}

	async upsertAnimeFeedItems(feedType: AnimeFeedType, animeIds: string[], page = 1) {
		const feedFetchedAt = new Date().toISOString()
		const payload = animeIds.map((animeId, position) => ({
			feed_type: feedType,
			anime_id: animeId,
			page,
			position,
			feed_fetched_at: feedFetchedAt,
		}))

		if (payload.length === 0) return

		await this.execute(
			this.supabase
				.from('anime_feed_items')
				.upsert(payload, { onConflict: 'feed_type,page,position' }),
			'upsert anime_feed_items'
		)
	}

	async upsertEpisodeFeedItems(feedType: EpisodeFeedType, episodeIds: string[]) {
		const feedFetchedAt = new Date().toISOString()
		const payload = episodeIds.map((episodeId, position) => ({
			feed_type: feedType,
			episode_id: episodeId,
			position,
			feed_fetched_at: feedFetchedAt,
		}))

		if (payload.length === 0) return

		await this.execute(
			this.supabase
				.from('episode_feed_items')
				.upsert(payload, { onConflict: 'feed_type,position' }),
			'upsert episode_feed_items'
		)
	}

	async upsertAnimeDetails(anime: AnimeDetail) {
		await this.execute(
			this.supabase.from('animes').upsert(
				[
					{
						animeId: anime.animeId,
						title: anime.title,
						cover_image_key: anime.coverImageKey ?? null,
						carousel_image_keys: anime.carouselImageKeys ?? [],
						description: anime.description ?? null,
						originalLink: anime.originalLink ?? null,
						status: anime.status ?? null,
						type: anime.type ?? null,
						genres: anime.genres ?? null,
						images: anime.images ?? null,
					},
				],
				{ onConflict: 'animeId' }
			),
			'upsert animes'
		)

		if (!anime.relatedAnimes || anime.relatedAnimes.length === 0) {
			return
		}

		await this.execute(
			this.supabase.from('related_animes').upsert(
				anime.relatedAnimes.map((relatedAnime) => ({
					anime_id: anime.animeId,
					related_id: relatedAnime.animeId,
					title: relatedAnime.title,
					relation: relatedAnime.relation,
				})),
				{ onConflict: 'anime_id,related_id,relation' }
			),
			'upsert related_animes'
		)
	}

	async upsertEpisodes(episodes: EpisodeDetail[]) {
		if (episodes.length === 0) return

		await this.execute(
			this.supabase.from('episodes').upsert(
				episodes.map((episode) => ({
					episodeId: episode.episodeId,
					animeId: episode.animeId,
					episode: episode.episode,
					title: episode.title ?? null,
					originalLink: episode.originalLink ?? null,
					image: episode.image ?? null,
				})),
				{ onConflict: 'episodeId' }
			),
			'upsert episodes'
		)
	}

	async upsertEpisodeSources(record: EpisodeSourcesRecord) {
		await this.execute(
			this.supabase.from('episode_sources').upsert(
				[
					{
						episode_id: record.episodeId,
						episode: record.episode,
						videos: record.videos,
						scraped_at: record.scrapedAt,
						expires_at: record.expiresAt,
					},
				],
				{ onConflict: 'episode_id' }
			),
			'upsert episode_sources'
		)
	}

	async markSyncState(resourceType: string, resourceId: string, status: 'success' | 'error', errorMessage?: string) {
		await this.execute(
			this.supabase.from('sync_state').upsert(
				[
					{
						resource_type: resourceType,
						resource_id: resourceId,
						status,
						last_success_at: status === 'success' ? new Date().toISOString() : null,
						last_error_at: status === 'error' ? new Date().toISOString() : null,
						error_message: errorMessage ?? null,
						error_count: status === 'error' ? 1 : 0,
					},
				],
				{ onConflict: 'resource_type,resource_id' }
			),
			'upsert sync_state'
		)
	}

	async getAnimeIdsFromFeed(limit = 200) {
		const { data } = await this.execute(
			this.supabase
				.from('anime_feed_items')
				.select('anime_id')
				.order('updated_at', { ascending: false })
				.limit(limit),
			'select anime_feed_items'
		)

		const items = (data ?? []) as Array<{ anime_id: string }>
		return Array.from(new Set(items.map((item) => item.anime_id)))
	}

	async getRecentEpisodeIds(limit = 200, daysWindow = 7) {
		const fromDate = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000).toISOString()
		const { data } = await this.execute(
			this.supabase
				.from('episodes')
				.select('episodeId')
				.gte('updated_at', fromDate)
				.order('updated_at', { ascending: false })
				.limit(limit),
			'select episodes'
		)

		const items = (data ?? []) as Array<{ episodeId: string }>
		return Array.from(new Set(items.map((item) => item.episodeId)))
	}

	async getMaxEpisodeNumberByAnimeId(animeId: string) {
		const { data } = await this.execute(
			this.supabase
				.from('episodes')
				.select('episode')
				.eq('animeId', animeId)
				.order('episode', { ascending: false })
				.limit(1),
			'select max episode by anime'
		)

		const items = (data ?? []) as Array<{ episode: number | null }>
		const maxEpisode = items[0]?.episode
		return typeof maxEpisode === 'number' && Number.isFinite(maxEpisode) ? maxEpisode : 0
	}

	async getEpisodeIdsNeedingSourceRefresh(limit = 200, daysWindow = 7, now = new Date()) {
		const episodeIds = await this.getRecentEpisodeIds(limit, daysWindow)
		if (episodeIds.length === 0) return []

		const { data } = await this.execute(
			this.supabase
				.from('episode_sources')
				.select('episode_id,expires_at')
				.in('episode_id', episodeIds),
			'select episode_sources'
		)

		const sourceRows = (data ?? []) as Array<{ episode_id: string; expires_at: string | null }>
		const expiryByEpisodeId = new Map(sourceRows.map((row) => [row.episode_id, row.expires_at]))
		const nowMs = now.getTime()

		return episodeIds.filter((episodeId) => {
			const expiresAt = expiryByEpisodeId.get(episodeId)
			if (!expiresAt) return true

			const expiresAtMs = new Date(expiresAt).getTime()
			return !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs
		})
	}
}
