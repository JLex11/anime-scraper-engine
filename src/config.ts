const getEnv = (key: string, required = true) => {
	const value = process.env[key]
	if (required && !value) {
		throw new Error(`Missing required env var: ${key}`)
	}

	return value ?? ''
}

export const config = {
	supabaseUrl: getEnv('SUPABASE_URL'),
	supabaseServiceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
	animeFlvBaseUrl: process.env.ANIMEFLV_BASE_URL || 'https://www3.animeflv.net',
	requestTimeoutMs: Number(process.env.SCRAPER_REQUEST_TIMEOUT_MS || '15000'),
	maxConcurrency: Number(process.env.SCRAPER_MAX_CONCURRENCY || '6'),
	logLevel: process.env.SCRAPER_LOG_LEVEL || 'info',
	runOnce: process.env.SCRAPER_RUN_ONCE === 'true',
	r2AccountId: process.env.R2_ACCOUNT_ID || '',
	r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
	r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
	r2Bucket: process.env.R2_BUCKET || 'anime-app',
	r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL || '',
}
