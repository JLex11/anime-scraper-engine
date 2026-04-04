import { fetchAnimeFlvHtml } from "./clients/animeflvClient";
import { GoogleCustomSearchClient } from "./clients/googleCustomSearchClient";
import { JikanClient } from "./clients/jikanClient";
import { createSupabaseClient } from "./clients/supabaseClient";
import { createConfig, type RuntimeEnv } from "./config";
import {
	KvPersistentCacheStore,
	type KvNamespaceLike,
} from "./http/persistentCache";
import { RequestCoordinator } from "./http/requestCoordinator";
import {
	AnimeFlvPageLoader,
	JikanMatchLoader,
} from "./loaders/pageLoaders";
import type { PipelineContext } from "./pipelines/context";
import { Logger } from "./utils/logger";
import { type R2BucketLike, R2Writer } from "./writers/r2Writer";
import { SupabaseWriter } from "./writers/supabaseWriter";

const asObject = (value: unknown): Record<string, unknown> | null => {
	if (value == null || typeof value !== "object") return null;
	return value as Record<string, unknown>;
};

const asR2Binding = (value: unknown) => {
	const obj = asObject(value);
	if (!obj) return null;
	return typeof obj.put === "function" ? (obj as R2BucketLike) : null;
};

const asKvBinding = (value: unknown) => {
	const obj = asObject(value);
	if (!obj) return null;

	return typeof obj.get === "function" &&
		typeof obj.put === "function" &&
		typeof obj.delete === "function"
		? (obj as KvNamespaceLike)
		: null;
};

export const createPipelineContext = (env: RuntimeEnv): PipelineContext => {
	const config = createConfig(env);
	const logger = new Logger(
		(config.logLevel as "debug" | "info" | "warn" | "error") || "info",
	);
	const supabase = createSupabaseClient(config);
	const writer = new SupabaseWriter(supabase);
	const r2Binding = asR2Binding(env[config.r2BucketBinding]);
	const cacheBinding = asKvBinding(env[config.scraperCacheBinding]);
	const r2Writer = new R2Writer(config, r2Binding);
	const persistentCache = cacheBinding
		? new KvPersistentCacheStore(cacheBinding)
		: null;
	const requestCoordinator = new RequestCoordinator({
		logger,
		persistentCache,
		defaultRetryAttempts: config.requestRetryAttempts,
		defaultTimeoutMs: config.requestTimeoutMs,
	});
	const pageLoader = new AnimeFlvPageLoader(config, requestCoordinator);
	const jikanMatchLoader = new JikanMatchLoader({
		cacheStore: persistentCache,
		logger,
	});
	const jikanClient = new JikanClient(
		{
			...config,
			onLog: (level, message, meta) => {
				if (level === "warn") {
					logger.warn(message, meta);
					return;
				}
				logger.info(message, meta);
			},
		},
		undefined,
		requestCoordinator,
	);
	const googleSearchClient = new GoogleCustomSearchClient(
		{
			...config,
			onLog: (level, message, meta) => {
				if (level === "warn") {
					logger.warn(message, meta);
					return;
				}
				logger.info(message, meta);
			},
		},
		undefined,
		requestCoordinator,
	);

	return {
		config,
		logger,
		writer,
		r2Writer,
		jikanClient,
		googleSearchClient,
		requestCoordinator,
		pageLoader,
		jikanMatchLoader,
		fetchHtml: (path: string) =>
			pageLoader.getPath(path).catch(() => fetchAnimeFlvHtml(config, path)),
	};
};
