import { runCron, runOnce } from './scheduler'
import { createPipelineContext } from './runtime'

type WorkerEnv = Record<string, unknown>

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

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
			await runOnce(ctx)
			return json({ ok: true, mode: 'run-once' })
		}

		return json({ error: 'Not found' }, { status: 404 })
	},

	async scheduled(controller: { cron: string }, env: WorkerEnv): Promise<void> {
		const ctx = createPipelineContext(env)
		await runCron(ctx, controller.cron)
	},
}
