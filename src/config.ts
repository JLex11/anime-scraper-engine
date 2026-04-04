export type RuntimeEnv = Record<string, unknown>;

export type AppConfig = {
	supabaseUrl: string;
	supabaseServiceRoleKey: string;
	animeFlvBaseUrl: string;
	jikanBaseUrl: string;
	requestTimeoutMs: number;
	requestRetryAttempts: number;
	maxConcurrency: number;
	logLevel: string;
	runOnce: boolean;
	manualRunToken: string;
	r2AccountId: string;
	r2AccessKeyId: string;
	r2SecretAccessKey: string;
	r2Bucket: string;
	r2PublicBaseUrl: string;
	r2BucketBinding: string;
	scraperCacheBinding: string;
	googleCseApiKey: string;
	googleCseCx: string;
	googleCseBaseUrl: string;
};

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const readEnv = (env: RuntimeEnv, key: string, required = true) => {
	const value = asString(env[key]);
	if (required && !value) {
		throw new Error(`Missing required env var: ${key}`);
	}
	return value;
};

export const createConfig = (env: RuntimeEnv): AppConfig => {
	return {
		supabaseUrl: readEnv(env, "SUPABASE_URL"),
		supabaseServiceRoleKey: readEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
		animeFlvBaseUrl:
			asString(env.ANIMEFLV_BASE_URL) || "https://www3.animeflv.net",
		jikanBaseUrl: asString(env.JIKAN_BASE_URL) || "https://api.jikan.moe/v4",
		requestTimeoutMs: Number(
			asString(env.SCRAPER_REQUEST_TIMEOUT_MS) || "15000",
		),
		requestRetryAttempts: Number(
			asString(env.SCRAPER_REQUEST_RETRY_ATTEMPTS) || "1",
		),
		maxConcurrency: Number(asString(env.SCRAPER_MAX_CONCURRENCY) || "6"),
		logLevel: asString(env.SCRAPER_LOG_LEVEL) || "info",
		runOnce: asString(env.SCRAPER_RUN_ONCE) === "true",
		manualRunToken: asString(env.SCRAPER_MANUAL_RUN_TOKEN),
		r2AccountId: asString(env.R2_ACCOUNT_ID),
		r2AccessKeyId: asString(env.R2_ACCESS_KEY_ID),
		r2SecretAccessKey: asString(env.R2_SECRET_ACCESS_KEY),
		r2Bucket: asString(env.R2_BUCKET) || "anime-app",
		r2PublicBaseUrl: asString(env.R2_PUBLIC_BASE_URL),
		r2BucketBinding: asString(env.R2_BUCKET_BINDING) || "R2",
		scraperCacheBinding:
			asString(env.SCRAPER_CACHE_BINDING) || "SCRAPER_CACHE",
		googleCseApiKey: asString(env.GOOGLE_CSE_API_KEY),
		googleCseCx: asString(env.GOOGLE_CSE_CX),
		googleCseBaseUrl:
			asString(env.GOOGLE_CSE_BASE_URL) ||
			"https://www.googleapis.com/customsearch/v1",
	};
};
