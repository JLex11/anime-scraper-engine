import type { AppConfig } from '../config'
import type { SupabaseWriter } from '../writers/supabaseWriter'
import type { Logger } from '../utils/logger'
import type { R2Writer } from '../writers/r2Writer'

export interface PipelineContext {
	config: AppConfig
	writer: SupabaseWriter
	logger: Logger
	r2Writer?: R2Writer
	fetchHtml: (path: string) => Promise<string | null>
}
