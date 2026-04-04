import type { Logger } from "../utils/logger";
import type {
	PersistentCacheEntry,
	PersistentCacheStore,
} from "./persistentCache";

export type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

type CacheScope = "none" | "memory" | "persistent";

export type RequestPolicy = {
	cacheKey?: string;
	cacheScope?: CacheScope;
	ttlMs?: number;
	staleWhileRevalidateMs?: number;
	retryAttempts?: number;
	timeoutMs?: number;
	dedupe?: boolean;
	headers?: HeadersInit;
	meta?: Record<string, unknown>;
};

type CachedResponse = {
	contentType: string;
	encoding: "utf8" | "base64";
	body: string;
	storedAt: number;
	expiresAt: number;
	staleUntilAt: number | null;
	meta?: Record<string, unknown>;
};

type RequestCoordinatorOptions = {
	logger?: Pick<Logger, "debug" | "warn">;
	persistentCache?: PersistentCacheStore | null;
	fetchImpl?: FetchLike;
	defaultRetryAttempts?: number;
	defaultTimeoutMs?: number;
};

const defaultFetch: FetchLike = (input, init) =>
	globalThis.fetch(input as RequestInfo | URL, init);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientError = (error: unknown) => {
	if (!(error instanceof Error)) return false;
	return error.name === "TimeoutError" || error.name === "AbortError";
};

const isTransientStatus = (status: number) =>
	status === 408 || status === 425 || status === 429 || status >= 500;

const stableHash = (value: string) =>
	encodeURIComponent(value).slice(0, 512);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const bytesToBinary = (value: Uint8Array) => {
	let binary = "";
	for (const byte of value) {
		binary += String.fromCharCode(byte);
	}
	return binary;
};

const toText = (value: Uint8Array) => textDecoder.decode(value);

const toBase64 = (value: Uint8Array) => btoa(bytesToBinary(value));

const fromBase64 = (value: string) => {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
};

const nowMs = () => Date.now();

const isFresh = (entry: CachedResponse, now = nowMs()) => entry.expiresAt > now;

const isStaleButUsable = (entry: CachedResponse, now = nowMs()) =>
	entry.expiresAt <= now &&
	entry.staleUntilAt !== null &&
	entry.staleUntilAt > now;

const toPersistentEntry = (
	key: string,
	entry: CachedResponse,
): PersistentCacheEntry => ({
	key,
	contentType: entry.contentType,
	encoding: entry.encoding,
	body: entry.body,
	storedAt: new Date(entry.storedAt).toISOString(),
	expiresAt: new Date(entry.expiresAt).toISOString(),
	staleUntilAt:
		entry.staleUntilAt == null
			? null
			: new Date(entry.staleUntilAt).toISOString(),
	meta: entry.meta,
});

const fromPersistentEntry = (
	entry: PersistentCacheEntry,
): CachedResponse | null => {
	const storedAt = new Date(entry.storedAt).getTime();
	const expiresAt = new Date(entry.expiresAt).getTime();
	const staleUntilAt = entry.staleUntilAt
		? new Date(entry.staleUntilAt).getTime()
		: null;
	if (!Number.isFinite(storedAt) || !Number.isFinite(expiresAt)) return null;
	return {
		contentType: entry.contentType,
		encoding: entry.encoding,
		body: entry.body,
		storedAt,
		expiresAt,
		staleUntilAt:
			staleUntilAt != null && Number.isFinite(staleUntilAt)
				? staleUntilAt
				: null,
		meta: entry.meta,
	};
};

export class RequestCoordinator {
	private readonly memoryCache = new Map<string, CachedResponse>();
	private readonly inFlight = new Map<string, Promise<CachedResponse | null>>();
	private readonly fetchImpl: FetchLike;
	private readonly logger?: Pick<Logger, "debug" | "warn">;
	private readonly persistentCache: PersistentCacheStore | null;
	private readonly defaultRetryAttempts: number;
	private readonly defaultTimeoutMs: number;

	constructor(options: RequestCoordinatorOptions = {}) {
		this.fetchImpl = options.fetchImpl ?? defaultFetch;
		this.logger = options.logger;
		this.persistentCache = options.persistentCache ?? null;
		this.defaultRetryAttempts = options.defaultRetryAttempts ?? 1;
		this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000;
	}

	async requestText(
		url: string,
		init?: RequestInit,
		policy?: RequestPolicy,
	): Promise<string | null> {
		const cached = await this.request(url, init, {
			...policy,
			expectedEncoding: "utf8",
		});
		if (!cached) return null;
		return cached.encoding === "utf8" ? cached.body : toText(fromBase64(cached.body));
	}

	async requestJson<T>(
		url: string,
		init?: RequestInit,
		policy?: RequestPolicy,
	): Promise<T | null> {
		const text = await this.requestText(url, init, policy);
		if (!text) return null;

		try {
			return JSON.parse(text) as T;
		} catch (error) {
			this.logger?.warn?.("request.json.parse_error", {
				url,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	async requestBinary(
		url: string,
		init?: RequestInit,
		policy?: RequestPolicy,
	): Promise<Uint8Array | null> {
		const cached = await this.request(url, init, {
			...policy,
			expectedEncoding: "base64",
		});
		if (!cached) return null;
		return cached.encoding === "base64"
			? fromBase64(cached.body)
			: textEncoder.encode(cached.body);
	}

	private async request(
		url: string,
		init: RequestInit = {},
		policy?: RequestPolicy & { expectedEncoding?: "utf8" | "base64" },
	): Promise<CachedResponse | null> {
		const resolvedPolicy = this.resolvePolicy(url, policy);
		const cacheKey = resolvedPolicy.cacheKey;

		if (cacheKey && resolvedPolicy.cacheScope !== "none") {
			const memoryHit = this.memoryCache.get(cacheKey);
			if (memoryHit && (isFresh(memoryHit) || isStaleButUsable(memoryHit))) {
				this.logger?.debug?.("request.cache.memory_hit", { url, cacheKey });
				if (isStaleButUsable(memoryHit) && resolvedPolicy.cacheScope === "persistent") {
					void this.refreshInBackground(url, init, resolvedPolicy);
				}
				return memoryHit;
			}

			if (resolvedPolicy.cacheScope === "persistent" && this.persistentCache) {
				try {
					const persisted = await this.persistentCache.get(cacheKey);
					const entry = persisted ? fromPersistentEntry(persisted) : null;
					if (entry && (isFresh(entry) || isStaleButUsable(entry))) {
						this.memoryCache.set(cacheKey, entry);
						this.logger?.debug?.("request.cache.persistent_hit", {
							url,
							cacheKey,
						});
						if (isStaleButUsable(entry)) {
							void this.refreshInBackground(url, init, resolvedPolicy);
						}
						return entry;
					}
				} catch (error) {
					this.logger?.warn?.("request.cache.persistent_read_failed", {
						url,
						cacheKey,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		if (cacheKey && resolvedPolicy.dedupe) {
			const inFlight = this.inFlight.get(cacheKey);
			if (inFlight) return inFlight;
		}

		const requestPromise = this.fetchAndCache(url, init, resolvedPolicy);
		if (cacheKey && resolvedPolicy.dedupe) {
			this.inFlight.set(cacheKey, requestPromise);
		}

		try {
			return await requestPromise;
		} finally {
			if (cacheKey && resolvedPolicy.dedupe) {
				this.inFlight.delete(cacheKey);
			}
		}
	}

	private async refreshInBackground(
		url: string,
		init: RequestInit,
		policy: ResolvedPolicy,
	) {
		try {
			await this.fetchAndCache(url, init, policy);
		} catch {
			// Best effort refresh only.
		}
	}

	private async fetchAndCache(
		url: string,
		init: RequestInit,
		policy: ResolvedPolicy,
	): Promise<CachedResponse | null> {
		const attempts = Math.max(1, policy.retryAttempts + 1);

		for (let attempt = 1; attempt <= attempts; attempt += 1) {
			try {
				const headers = {
					...(policy.headers ?? {}),
					...(init.headers ?? {}),
				};
				const response = await this.fetchImpl(url, {
					...init,
					headers,
					signal: AbortSignal.timeout(policy.timeoutMs),
				});

				if (response.ok) {
					const contentType =
						response.headers.get("content-type") ??
						(policy.expectedEncoding === "base64"
							? "application/octet-stream"
							: "text/plain; charset=utf-8");
					const bodyBytes = new Uint8Array(await response.arrayBuffer());
					const cached: CachedResponse = {
						contentType,
						encoding: policy.expectedEncoding,
						body:
							policy.expectedEncoding === "base64"
								? toBase64(bodyBytes)
								: toText(bodyBytes),
						storedAt: nowMs(),
						expiresAt: nowMs() + policy.ttlMs,
						staleUntilAt:
							policy.staleWhileRevalidateMs > 0
								? nowMs() + policy.ttlMs + policy.staleWhileRevalidateMs
								: null,
						meta: policy.meta,
					};
					await this.persist(policy.cacheKey, cached, policy);
					return cached;
				}

				if (!isTransientStatus(response.status)) {
					return null;
				}
			} catch (error) {
				if (!isTransientError(error)) {
					return null;
				}
			}

			if (attempt < attempts) {
				await sleep(250 * attempt);
			}
		}

		return null;
	}

	private async persist(
		cacheKey: string | null,
		entry: CachedResponse,
		policy: ResolvedPolicy,
	) {
		if (!cacheKey || policy.cacheScope === "none") return;

		this.memoryCache.set(cacheKey, entry);

		if (policy.cacheScope !== "persistent" || !this.persistentCache) return;

		try {
			await this.persistentCache.set(toPersistentEntry(cacheKey, entry), {
				ttlMs: policy.ttlMs,
				staleWhileRevalidateMs: policy.staleWhileRevalidateMs,
			});
		} catch (error) {
			this.logger?.warn?.("request.cache.persistent_write_failed", {
				cacheKey,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private resolvePolicy(
		url: string,
		policy?: RequestPolicy & { expectedEncoding?: "utf8" | "base64" },
	): ResolvedPolicy {
		const cacheScope = policy?.cacheScope ?? "memory";
		return {
			cacheKey:
				policy?.cacheKey ??
				(cacheScope === "none" ? null : stableHash(url)),
			cacheScope,
			ttlMs: Math.max(0, policy?.ttlMs ?? 0),
			staleWhileRevalidateMs: Math.max(0, policy?.staleWhileRevalidateMs ?? 0),
			retryAttempts: Math.max(
				0,
				policy?.retryAttempts ?? this.defaultRetryAttempts,
			),
			timeoutMs: Math.max(1, policy?.timeoutMs ?? this.defaultTimeoutMs),
			dedupe: policy?.dedupe ?? true,
			headers: policy?.headers,
			meta: policy?.meta,
			expectedEncoding: policy?.expectedEncoding ?? "utf8",
		};
	}
}

type ResolvedPolicy = {
	cacheKey: string | null;
	cacheScope: CacheScope;
	ttlMs: number;
	staleWhileRevalidateMs: number;
	retryAttempts: number;
	timeoutMs: number;
	dedupe: boolean;
	headers?: HeadersInit;
	meta?: Record<string, unknown>;
	expectedEncoding: "utf8" | "base64";
};
