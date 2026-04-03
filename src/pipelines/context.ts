import type { AppConfig } from '../config'
import type { SupabaseWriter } from '../writers/supabaseWriter'
import type { Logger } from '../utils/logger'
import type { R2Writer } from '../writers/r2Writer'
import type { JikanClient } from '../clients/jikanClient'

export interface PipelineContext {
	config: AppConfig
	writer: SupabaseWriter
	logger: Logger
	r2Writer?: R2Writer
	jikanClient: JikanClient
	fetchHtml: (path: string) => Promise<string | null>
}
