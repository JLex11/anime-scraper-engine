import { config } from './config'
import { runOnce, runScheduler } from './scheduler'
import { Logger } from './utils/logger'
import { R2Writer } from './writers/r2Writer'
import { SupabaseWriter } from './writers/supabaseWriter'

const logger = new Logger((config.logLevel as 'debug' | 'info' | 'warn' | 'error') || 'info')
const writer = new SupabaseWriter()
const r2Writer = new R2Writer()

const main = async () => {
	logger.info('anime-scraper-engine booting', {
		baseUrl: config.animeFlvBaseUrl,
		maxConcurrency: config.maxConcurrency,
		runOnce: config.runOnce,
		r2Enabled: r2Writer.isEnabled(),
	})

	const ctx = { writer, logger, r2Writer }
	if (config.runOnce) {
		await runOnce(ctx)
		return
	}

	await runScheduler(ctx)
}

void main().catch((error) => {
	logger.error('fatal', { error: String(error) })
	process.exit(1)
})
