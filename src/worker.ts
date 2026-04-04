import { runCron, runOnce, runTaskByName, type TaskName } from './scheduler'
import { syncAnimeDetails } from './pipelines/syncAnimeDetails'
import { syncAnimeEpisodes } from './pipelines/syncAnimeEpisodes'
import { syncEpisodeSources } from './pipelines/syncEpisodeSources'
import { createPipelineContext } from './runtime'
import type { EpisodeDetail } from './types/models'
import { buildAnimeSeed, humanizeAnimeId } from './utils/animeSeed'

type WorkerEnv = Record<string, unknown>
type JsonObject = Record<string, unknown>

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const asTaskName = (value: string): TaskName | null => {
	switch (value) {
		case 'sync-latest-animes':
		case 'sync-latest-episodes':
		case 'sync-broadcast':
		case 'sync-top-rated':
		case 'sync-directory':
		case 'sync-details-and-episodes':
		case 'sync-episode-sources':
			return value
		default:
			return null
	}
}

const isAuthorizedManualRun = (request: Request, env: WorkerEnv) => {
	const configuredToken = asString(env.SCRAPER_MANUAL_RUN_TOKEN)
	if (!configuredToken) return false

	const authorization = request.headers.get('authorization')
	if (authorization?.startsWith('Bearer ')) {
		return authorization.slice('Bearer '.length) === configuredToken
	}

	return request.headers.get('x-run-once-token') === configuredToken
}

const json = (body: unknown, init?: ResponseInit) => {
	return new Response(JSON.stringify(body), {
		...init,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			...(init?.headers || {}),
		},
	})
}

const badRequest = (error: string) => json({ error }, { status: 400 })

const asBoolean = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

const normalizeIdList = (body: JsonObject, singularKey: string, pluralKey: string) => {
	const ids = [
		typeof body[singularKey] === 'string' ? body[singularKey] : null,
		...(Array.isArray(body[pluralKey]) ? body[pluralKey] : []),
	]

	return Array.from(
		new Set(
			ids
				.filter((value): value is string => typeof value === 'string')
				.map((value) => value.trim())
				.filter(Boolean)
		)
	)
}

const parseJsonObject = async (request: Request): Promise<JsonObject | null> => {
	try {
		const body = await request.json()
		if (!body || typeof body !== 'object' || Array.isArray(body)) return null
		return body as JsonObject
	} catch {
		return null
	}
}

const parseEpisodeNumber = (episodeId: string) => {
	const match = episodeId.match(/-(\d+)$/)
	return Number(match?.[1] || 0)
}

const parseAnimeIdFromEpisode = (episodeId: string) => {
	const match = episodeId.match(/(.+)-\d+$/)
	return match?.[1]?.trim() ?? ''
}

const buildEpisodeSeed = (episodeId: string): EpisodeDetail | null => {
	const animeId = parseAnimeIdFromEpisode(episodeId)
	const episode = parseEpisodeNumber(episodeId)
	if (!animeId || episode <= 0) return null

	return {
		episodeId,
		animeId,
		episode,
		title: humanizeAnimeId(animeId),
		originalLink: `https://www3.animeflv.net/ver/${episodeId}`,
		image: null,
	}
}

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const url = new URL(request.url)

		if (url.pathname === '/health') {
			return json({ ok: true, service: 'anime-scraper-engine-worker' })
		}

		// Optional manual trigger for emergency resyncs.
		if (url.pathname === '/run-once' && request.method === 'POST') {
			if (!isAuthorizedManualRun(request, env)) {
				return json({ error: 'Unauthorized' }, { status: 401 })
			}

			const ctx = createPipelineContext(env)
			const taskName = asTaskName(url.searchParams.get('task') ?? '')
			if (taskName) {
				await runTaskByName(ctx, taskName)
				return json({ ok: true, mode: 'run-task', task: taskName })
			}

			await runOnce(ctx)
			return json({ ok: true, mode: 'run-once' })
		}

		if (url.pathname === '/scrape/anime' && request.method === 'POST') {
			if (!isAuthorizedManualRun(request, env)) {
				return json({ error: 'Unauthorized' }, { status: 401 })
			}

			const body = await parseJsonObject(request)
			if (!body) {
				return badRequest('Invalid JSON body')
			}

			const animeIds = normalizeIdList(body, 'animeId', 'animeIds')
			if (animeIds.length === 0) {
				return badRequest('Provide animeId or animeIds')
			}

			const includeDetails = asBoolean(body.includeDetails, true)
			const includeEpisodes = asBoolean(body.includeEpisodes, true)
			if (!includeDetails && !includeEpisodes) {
				return badRequest('At least one of includeDetails or includeEpisodes must be true')
			}

			const ctx = createPipelineContext(env)
			await ctx.writer.ensureAnimeRecords(animeIds.map((animeId) => buildAnimeSeed(animeId)))

			if (includeDetails) {
				await syncAnimeDetails(ctx, animeIds)
			}

			if (includeEpisodes) {
				await syncAnimeEpisodes(ctx, animeIds)
			}

			return json({
				ok: true,
				mode: 'scrape-anime',
				animeIds,
				includeDetails,
				includeEpisodes,
			})
		}

		if (url.pathname === '/scrape/episode-sources' && request.method === 'POST') {
			if (!isAuthorizedManualRun(request, env)) {
				return json({ error: 'Unauthorized' }, { status: 401 })
			}

			const body = await parseJsonObject(request)
			if (!body) {
				return badRequest('Invalid JSON body')
			}

			const episodeIds = normalizeIdList(body, 'episodeId', 'episodeIds')
			if (episodeIds.length === 0) {
				return badRequest('Provide episodeId or episodeIds')
			}

			const episodeSeeds = episodeIds.map(buildEpisodeSeed)
			if (episodeSeeds.some((episode) => !episode)) {
				return badRequest('Episode ids must end with a numeric suffix, for example naruto-12')
			}

			const episodes = episodeSeeds.filter((episode): episode is EpisodeDetail => episode !== null)
			const ctx = createPipelineContext(env)
			await ctx.writer.ensureAnimeRecords(episodes.map((episode) => buildAnimeSeed(episode.animeId, episode.title ?? episode.animeId)))
			await ctx.writer.upsertEpisodes(episodes)
			await syncEpisodeSources(ctx, episodeIds)

			return json({
				ok: true,
				mode: 'scrape-episode-sources',
				episodeIds,
			})
		}

		return json({ error: 'Not found' }, { status: 404 })
	},

	async scheduled(controller: { cron: string }, env: WorkerEnv): Promise<void> {
		const ctx = createPipelineContext(env)
		await runCron(ctx, controller.cron)
	},
}
