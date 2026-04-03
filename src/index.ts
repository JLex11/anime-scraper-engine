import { runOnce, runScheduler } from './scheduler'
import { createPipelineContext } from './runtime'

const main = async () => {
	const ctx = createPipelineContext(process.env as unknown as Record<string, unknown>)

	ctx.logger.info('anime-scraper-engine booting', {
		baseUrl: ctx.config.animeFlvBaseUrl,
		maxConcurrency: ctx.config.maxConcurrency,
		runOnce: ctx.config.runOnce,
		r2Enabled: ctx.r2Writer?.isEnabled() ?? false,
	})

	if (ctx.config.runOnce) {
		await runOnce(ctx)
		return
	}

	await runScheduler(ctx)
}

void main().catch((error) => {
	console.error('[fatal]', error)
	process.exit(1)
})
