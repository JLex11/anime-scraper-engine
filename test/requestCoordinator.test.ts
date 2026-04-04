import { describe, expect, test } from "bun:test";
import { RequestCoordinator } from "../src/http/requestCoordinator";
import type {
	PersistentCacheEntry,
	PersistentCacheStore,
} from "../src/http/persistentCache";

const createEntry = (
	key: string,
	body: string,
	ttlMs = 60_000,
): PersistentCacheEntry => ({
	key,
	contentType: "text/plain; charset=utf-8",
	encoding: "utf8",
	body,
	storedAt: new Date().toISOString(),
	expiresAt: new Date(Date.now() + ttlMs).toISOString(),
	staleUntilAt: null,
});

describe("RequestCoordinator", () => {
	test("dedupea requests concurrentes con la misma cacheKey", async () => {
		let calls = 0;
		const coordinator = new RequestCoordinator({
			defaultRetryAttempts: 0,
			defaultTimeoutMs: 1_000,
			fetchImpl: async () => {
				calls += 1;
				await Bun.sleep(20);
				return new Response("<html>ok</html>", { status: 200 });
			},
		});

		const [first, second] = await Promise.all([
			coordinator.requestText("https://example.test/home", undefined, {
				cacheKey: "home",
				cacheScope: "memory",
				ttlMs: 60_000,
				dedupe: true,
			}),
			coordinator.requestText("https://example.test/home", undefined, {
				cacheKey: "home",
				cacheScope: "memory",
				ttlMs: 60_000,
				dedupe: true,
			}),
		]);

		expect(first).toBe("<html>ok</html>");
		expect(second).toBe("<html>ok</html>");
		expect(calls).toBe(1);
	});

	test("usa cache persistente cuando memoria no tiene entry", async () => {
		let calls = 0;
		const cacheStore: PersistentCacheStore = {
			get: async (key) => createEntry(key, '{"ok":true}'),
			set: async () => {},
			delete: async () => {},
			has: async () => true,
		};
		const coordinator = new RequestCoordinator({
			defaultRetryAttempts: 0,
			defaultTimeoutMs: 1_000,
			persistentCache: cacheStore,
			fetchImpl: async () => {
				calls += 1;
				return new Response('{"miss":true}', { status: 200 });
			},
		});

		const result = await coordinator.requestJson<{ ok: boolean }>(
			"https://example.test/data",
			undefined,
			{
				cacheKey: "json:data",
				cacheScope: "persistent",
				ttlMs: 60_000,
			},
		);

		expect(result).toEqual({ ok: true });
		expect(calls).toBe(0);
	});

	test("persiste al hacer miss total y luego sirve desde memoria", async () => {
		let calls = 0;
		const stored: PersistentCacheEntry[] = [];
		const cacheStore: PersistentCacheStore = {
			get: async () => null,
			set: async (entry) => {
				stored.push(entry);
			},
			delete: async () => {},
			has: async () => false,
		};
		const coordinator = new RequestCoordinator({
			defaultRetryAttempts: 0,
			defaultTimeoutMs: 1_000,
			persistentCache: cacheStore,
			fetchImpl: async () => {
				calls += 1;
				return new Response("cached-on-fetch", { status: 200 });
			},
		});

		const first = await coordinator.requestText(
			"https://example.test/page",
			undefined,
			{
				cacheKey: "page",
				cacheScope: "persistent",
				ttlMs: 60_000,
			},
		);
		const second = await coordinator.requestText(
			"https://example.test/page",
			undefined,
			{
				cacheKey: "page",
				cacheScope: "persistent",
				ttlMs: 60_000,
			},
		);

		expect(first).toBe("cached-on-fetch");
		expect(second).toBe("cached-on-fetch");
		expect(calls).toBe(1);
		expect(stored).toHaveLength(1);
		expect(stored[0]?.key).toBe("page");
	});

	test("si el cache persistente falla, hace fallback a fetch y loguea warning", async () => {
		const warns: Array<{ message: string; meta?: unknown }> = [];
		const coordinator = new RequestCoordinator({
			defaultRetryAttempts: 0,
			defaultTimeoutMs: 1_000,
			logger: {
				debug: () => {},
				warn: (message, meta) => {
					warns.push({ message, meta });
				},
			},
			persistentCache: {
				get: async () => {
					throw new Error("kv down");
				},
				set: async () => {},
				delete: async () => {},
				has: async () => false,
			},
			fetchImpl: async () =>
				new Response("<html>fallback</html>", { status: 200 }),
		});

		const result = await coordinator.requestText(
			"https://example.test/fallback",
			undefined,
			{
				cacheKey: "fallback",
				cacheScope: "persistent",
				ttlMs: 60_000,
			},
		);

		expect(result).toBe("<html>fallback</html>");
		expect(warns[0]?.message).toBe("request.cache.persistent_read_failed");
	});
});
