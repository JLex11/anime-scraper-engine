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
	/** Bun/Cloud Run scheduler. Workers Cron is optional in this deployment. */
	embeddedSchedulerEnabled?: boolean;
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

const readNumber = (
	env: RuntimeEnv,
	key: string,
	defaultValue: number,
	options: { min: number; max: number; integer?: boolean },
) => {
	const raw = asString(env[key]);
	if (!raw) return defaultValue;

	const value = Number(raw);
	const valid = Number.isFinite(value) &&
		value >= options.min &&
		value <= options.max &&
		(!options.integer || Number.isInteger(value));
	if (!valid) {
		throw new Error(
			`Invalid ${key}: expected ${options.integer ? "an integer" : "a number"} between ${options.min} and ${options.max}`,
		);
	}
	return value;
};

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
			asString(env.ANIMEFLV_BASE_URL) || "https://animeav1.com",
		jikanBaseUrl: asString(env.JIKAN_BASE_URL) || "https://api.jikan.moe/v4",
		requestTimeoutMs: readNumber(env, "SCRAPER_REQUEST_TIMEOUT_MS", 15000, {
			min: 1000,
			max: 120000,
		}),
		requestRetryAttempts: readNumber(env, "SCRAPER_REQUEST_RETRY_ATTEMPTS", 1, {
			min: 0,
			max: 5,
			integer: true,
		}),
		maxConcurrency: readNumber(env, "SCRAPER_MAX_CONCURRENCY", 6, {
			min: 1,
			max: 20,
			integer: true,
		}),
		logLevel: asString(env.SCRAPER_LOG_LEVEL) || "info",
		runOnce: asString(env.SCRAPER_RUN_ONCE) === "true",
		embeddedSchedulerEnabled:
			asString(env.SCRAPER_ENABLE_EMBEDDED_SCHEDULER) === "false"
				? false
				: true,
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
