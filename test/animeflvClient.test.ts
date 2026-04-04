import { describe, expect, test } from "bun:test";
import { fetchAnimeFlvHtml } from "../src/clients/animeflvClient";

const createConfig = (overrides?: Partial<Parameters<typeof fetchAnimeFlvHtml>[0]>) =>
	({
		supabaseUrl: "",
		supabaseServiceRoleKey: "",
		animeFlvBaseUrl: "https://animeflv.test",
		jikanBaseUrl: "https://api.jikan.test/v4",
		requestTimeoutMs: 1000,
		requestRetryAttempts: 1,
		maxConcurrency: 2,
		logLevel: "info",
		runOnce: true,
		manualRunToken: "",
		r2AccountId: "",
		r2AccessKeyId: "",
		r2SecretAccessKey: "",
		r2Bucket: "",
		r2PublicBaseUrl: "",
		r2BucketBinding: "",
		scraperCacheBinding: "SCRAPER_CACHE",
		googleCseApiKey: "",
		googleCseCx: "",
		googleCseBaseUrl: "https://www.googleapis.com/customsearch/v1",
		...overrides,
	} as Parameters<typeof fetchAnimeFlvHtml>[0]);

const withMockedFetch = async <T>(
	impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
	fn: () => Promise<T>,
) => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = impl as typeof fetch;

	try {
		return await fn();
	} finally {
		globalThis.fetch = originalFetch;
	}
};

describe("fetchAnimeFlvHtml", () => {
	test("construye la URL normalizada y retorna el HTML", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];

		await withMockedFetch(
			async (input, init) => {
				requests.push({ url: String(input), init });
				return new Response("<html>ok</html>", { status: 200 });
			},
			async () => {
				const html = await fetchAnimeFlvHtml(createConfig(), "anime/naruto");
				expect(html).toBe("<html>ok</html>");
			},
		);

		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe("https://animeflv.test/anime/naruto");
		expect(requests[0]?.init?.headers).toMatchObject({
			accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		});
	});

	test("reintenta respuestas transitorias y agota el intento configurado", async () => {
		let attempts = 0;

		await withMockedFetch(
			async () => {
				attempts += 1;
				return new Response("too many requests", { status: 429 });
			},
			async () => {
				const html = await fetchAnimeFlvHtml(
					createConfig({ requestRetryAttempts: 1 }),
					"/anime/bleach",
				);
				expect(html).toBeNull();
			},
		);

		expect(attempts).toBe(2);
	});

	test("no reintenta respuestas no transitorias", async () => {
		let attempts = 0;

		await withMockedFetch(
			async () => {
				attempts += 1;
				return new Response("not found", { status: 404 });
			},
			async () => {
				const html = await fetchAnimeFlvHtml(
					createConfig({ requestRetryAttempts: 3 }),
					"/anime/missing",
				);
				expect(html).toBeNull();
			},
		);

		expect(attempts).toBe(1);
	});
});
