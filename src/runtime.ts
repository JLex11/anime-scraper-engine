import { fetchAnimeFlvHtml } from './clients/animeflvClient'
import { JikanClient } from './clients/jikanClient'
import { createSupabaseClient } from './clients/supabaseClient'
import { createConfig, type RuntimeEnv } from './config'
import type { PipelineContext } from './pipelines/context'
import { Logger } from './utils/logger'
import { R2Writer } from './writers/r2Writer'
import { SupabaseWriter } from './writers/supabaseWriter'

const asObject = (value: unknown): Record<string, unknown> | null => {
	if (value == null || typeof value !== 'object') return null
	return value as Record<string, unknown>
}

const asR2Binding = (value: unknown) => {
	const obj = asObject(value)
	if (!obj) return null
	return typeof obj.put === 'function' ? (obj as { put: (...args: unknown[]) => Promise<unknown> }) : null
}

export const createPipelineContext = (env: RuntimeEnv): PipelineContext => {
	const config = createConfig(env)
	const logger = new Logger((config.logLevel as 'debug' | 'info' | 'warn' | 'error') || 'info')
	const supabase = createSupabaseClient(config)
	const writer = new SupabaseWriter(supabase)
	const r2Binding = asR2Binding(env[config.r2BucketBinding])
	const r2Writer = new R2Writer(config, r2Binding as any)
	const jikanClient = new JikanClient(config)

	return {
		config,
		logger,
		writer,
		r2Writer,
		jikanClient,
		fetchHtml: (path: string) => fetchAnimeFlvHtml(config, path),
	}
}
