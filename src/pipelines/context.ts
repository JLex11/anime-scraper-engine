import type { GoogleCustomSearchClient } from "../clients/googleCustomSearchClient";
import type { JikanClient } from "../clients/jikanClient";
import type { AppConfig } from "../config";
import type { Logger } from "../utils/logger";
import type { R2Writer } from "../writers/r2Writer";
import type { SupabaseWriter } from "../writers/supabaseWriter";

export interface PipelineContext {
	config: AppConfig;
	writer: SupabaseWriter;
	logger: Logger;
	r2Writer?: R2Writer;
	jikanClient: JikanClient;
	googleSearchClient?: GoogleCustomSearchClient;
	fetchHtml: (path: string) => Promise<string | null>;
}
