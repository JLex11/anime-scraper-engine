import { supabase } from '../clients/supabaseClient'
import type { AnimeDetail, AnimeFeedType, EpisodeDetail, EpisodeFeedType, EpisodeSourcesRecord } from '../types/models'

export class SupabaseWriter {
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

		await supabase
			.from('anime_feed_items')
			.upsert(payload, { onConflict: 'feed_type,page,position' })
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

		await supabase
			.from('episode_feed_items')
			.upsert(payload, { onConflict: 'feed_type,position' })
	}

	async upsertAnimeDetails(anime: AnimeDetail) {
		await supabase.from('animes').upsert(
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
		)

		if (!anime.relatedAnimes || anime.relatedAnimes.length === 0) {
			return
		}

		await supabase.from('related_animes').upsert(
			anime.relatedAnimes.map((relatedAnime) => ({
				anime_id: anime.animeId,
				related_id: relatedAnime.animeId,
				title: relatedAnime.title,
				relation: relatedAnime.relation,
			})),
			{ onConflict: 'anime_id,related_id,relation' }
		)
	}

	async upsertEpisodes(episodes: EpisodeDetail[]) {
		if (episodes.length === 0) return

		await supabase.from('episodes').upsert(
			episodes.map(episode => ({
				episodeId: episode.episodeId,
				animeId: episode.animeId,
				episode: episode.episode,
				title: episode.title ?? null,
				originalLink: episode.originalLink ?? null,
				image: episode.image ?? null,
			})),
			{ onConflict: 'episodeId' }
		)
	}

	async upsertEpisodeSources(record: EpisodeSourcesRecord) {
		await supabase.from('episode_sources').upsert(
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
		)
	}

	async markSyncState(resourceType: string, resourceId: string, status: 'success' | 'error', errorMessage?: string) {
		await supabase.from('sync_state').upsert(
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
		)
	}

	async getAnimeIdsFromFeed(limit = 200) {
		const { data } = await supabase
			.from('anime_feed_items')
			.select('anime_id')
			.order('updated_at', { ascending: false })
			.limit(limit)

		return Array.from(new Set((data ?? []).map(item => item.anime_id)))
	}

	async getRecentEpisodeIds(limit = 200, daysWindow = 7) {
		const fromDate = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000).toISOString()
		const { data } = await supabase
			.from('episodes')
			.select('episodeId')
			.gte('updated_at', fromDate)
			.order('updated_at', { ascending: false })
			.limit(limit)

		return Array.from(new Set((data ?? []).map(item => item.episodeId)))
	}
}
