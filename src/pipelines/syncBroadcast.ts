import { extractAnimeIds } from '../extractors/extractIds'
import { buildAnimeSeed } from '../utils/animeSeed'
import { syncAnimeDetails } from './syncAnimeDetails'
import type { PipelineContext } from './context'
import { loadHomepage } from './pageAccess'
import { isAnimeAv1BaseUrl } from '../utils/animeSeed'

const FEED_LIMIT = 40
const DETAIL_WARM_LIMIT = 3

export const syncBroadcast = async (ctx: PipelineContext) => {
	const animeAv1 = isAnimeAv1BaseUrl(ctx.config.animeFlvBaseUrl)
	const html = animeAv1
		? await (ctx.pageLoader?.getPath('/horario') ?? ctx.fetchHtml('/horario'))
		: await loadHomepage(ctx)
	if (!html) {
		ctx.logger.warn('syncBroadcast: homepage unavailable')
		await ctx.writer.markSyncState('feed', 'broadcast_animes', 'error', 'Homepage unavailable')
		return
	}

	const animeIds = await extractAnimeIds(html, animeAv1 ? 'article a[href^="/media/"]' : '.Emision .ListSdbr li a')
	const broadcastIds = animeIds.slice(0, FEED_LIMIT)
	await ctx.writer.ensureAnimeRecords(broadcastIds.map((animeId) => buildAnimeSeed(animeId, undefined, ctx.config.animeFlvBaseUrl)))
	await ctx.writer.upsertAnimeFeedItems('broadcast', broadcastIds, 1)
	await ctx.writer.markSyncState('feed', 'broadcast_animes', 'success')
	await syncAnimeDetails(ctx, broadcastIds.slice(0, DETAIL_WARM_LIMIT))
}
