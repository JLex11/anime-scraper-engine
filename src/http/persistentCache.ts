export type PersistentCacheEntry = {
	key: string;
	contentType: string;
	encoding: "utf8" | "base64";
	body: string;
	storedAt: string;
	expiresAt: string;
	staleUntilAt?: string | null;
	meta?: Record<string, unknown>;
};

export interface PersistentCacheStore {
	get(key: string): Promise<PersistentCacheEntry | null>;
	set(
		entry: PersistentCacheEntry,
		options?: { ttlMs?: number; staleWhileRevalidateMs?: number },
	): Promise<void>;
	delete(key: string): Promise<void>;
	has(key: string): Promise<boolean>;
}

export type KvNamespaceLike = {
	get(key: string, type: "text"): Promise<string | null>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>;
	delete(key: string): Promise<void>;
};

export const serializePersistentCacheEntry = (
	entry: PersistentCacheEntry,
) => JSON.stringify(entry);

export const deserializePersistentCacheEntry = (
	value: string | null,
): PersistentCacheEntry | null => {
	if (!value) return null;

	try {
		const parsed = JSON.parse(value) as PersistentCacheEntry;
		if (!parsed || typeof parsed !== "object") return null;
		if (!parsed.key || !parsed.contentType || !parsed.encoding || !parsed.body) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
};

export class KvPersistentCacheStore implements PersistentCacheStore {
	constructor(private readonly kv: KvNamespaceLike) {}

	async get(key: string): Promise<PersistentCacheEntry | null> {
		return deserializePersistentCacheEntry(
			await this.kv.get(keyForCache(key), "text"),
		);
	}

	async set(
		entry: PersistentCacheEntry,
		options?: { ttlMs?: number; staleWhileRevalidateMs?: number },
	): Promise<void> {
		const ttlMs = Math.max(0, options?.ttlMs ?? 0);
		const staleMs = Math.max(0, options?.staleWhileRevalidateMs ?? 0);
		const expirationTtl = Math.max(
			1,
			Math.ceil((ttlMs + staleMs) / 1000) || 1,
		);

		await this.kv.put(keyForCache(entry.key), serializePersistentCacheEntry(entry), {
			expirationTtl,
		});
	}

	async delete(key: string): Promise<void> {
		await this.kv.delete(keyForCache(key));
	}

	async has(key: string): Promise<boolean> {
		return (await this.kv.get(keyForCache(key), "text")) !== null;
	}
}

const keyForCache = (key: string) => `request-cache:${key}`;
