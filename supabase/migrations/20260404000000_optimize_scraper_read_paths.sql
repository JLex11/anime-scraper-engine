-- Optimize scraper read paths and scheduler lookups.
-- These indexes match the current hot queries used by the scraper worker.

CREATE INDEX IF NOT EXISTS idx_episodes_anime_id_episode_desc
ON public.episodes ("animeId", "episode" DESC);

CREATE INDEX IF NOT EXISTS idx_episodes_updated_at_desc
ON public.episodes ("updated_at" DESC);

CREATE INDEX IF NOT EXISTS idx_anime_feed_items_updated_at_desc
ON public.anime_feed_items (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_state_resource_type_next_run_at
ON public.sync_state (resource_type, next_run_at);
