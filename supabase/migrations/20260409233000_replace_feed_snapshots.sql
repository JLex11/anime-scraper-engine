CREATE OR REPLACE FUNCTION public.replace_anime_feed_page(
	p_feed_type TEXT,
	p_page INTEGER,
	p_anime_ids TEXT[],
	p_feed_fetched_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM public.anime_feed_items
	WHERE feed_type = p_feed_type
		AND page = p_page;

	INSERT INTO public.anime_feed_items (
		feed_type,
		anime_id,
		page,
		position,
		feed_fetched_at
	)
	SELECT
		p_feed_type,
		item.anime_id,
		p_page,
		item.position - 1,
		COALESCE(p_feed_fetched_at, NOW())
	FROM (
		SELECT DISTINCT ON (anime_id)
			anime_id,
			position
		FROM unnest(COALESCE(p_anime_ids, ARRAY[]::TEXT[])) WITH ORDINALITY AS source(anime_id, position)
		WHERE anime_id IS NOT NULL
			AND btrim(anime_id) <> ''
		ORDER BY anime_id, position
	) AS item
	ORDER BY item.position;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_episode_feed(
	p_feed_type TEXT,
	p_episode_ids TEXT[],
	p_feed_fetched_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	DELETE FROM public.episode_feed_items
	WHERE feed_type = p_feed_type;

	INSERT INTO public.episode_feed_items (
		feed_type,
		episode_id,
		position,
		feed_fetched_at
	)
	SELECT
		p_feed_type,
		item.episode_id,
		item.position - 1,
		COALESCE(p_feed_fetched_at, NOW())
	FROM (
		SELECT DISTINCT ON (episode_id)
			episode_id,
			position
		FROM unnest(COALESCE(p_episode_ids, ARRAY[]::TEXT[])) WITH ORDINALITY AS source(episode_id, position)
		WHERE episode_id IS NOT NULL
			AND btrim(episode_id) <> ''
		ORDER BY episode_id, position
	) AS item
	ORDER BY item.position;
END;
$$;
