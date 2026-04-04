import { describe, expect, test } from "bun:test";
import { GoogleCustomSearchClient } from "../src/clients/googleCustomSearchClient";

const createResponse = (status: number, payload: unknown) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: { "content-type": "application/json" },
	});

describe("GoogleCustomSearchClient", () => {
	test("searchImageBanners construye query y retorna imagenes validas", async () => {
		const requests: string[] = [];
		const client = new GoogleCustomSearchClient(
			{
				googleCseApiKey: "api-key",
				googleCseCx: "cx-id",
				googleCseBaseUrl: "https://www.googleapis.com/customsearch/v1",
				requestTimeoutMs: 1000,
				requestRetryAttempts: 0,
			},
			async (input) => {
				requests.push(String(input));
				return createResponse(200, {
					items: [
						{
							link: "https://img.example/banner-1.jpg",
							title: "Banner 1",
							mime: "image/jpeg",
							image: { width: 1280, height: 720 },
						},
						{
							link: "not-a-url",
							image: { width: 100, height: 100 },
						},
					],
				});
			},
		);

		const results = await client.searchImageBanners("Naruto", 3);

		expect(requests).toHaveLength(1);
		expect(requests[0]).toContain("q=Naruto");
		expect(requests[0]).toContain("searchType=image");
		expect(requests[0]).toContain("num=3");
		expect(results).toEqual([
			{
				link: "https://img.example/banner-1.jpg",
				title: "Banner 1",
				mime: "image/jpeg",
				width: 1280,
				height: 720,
			},
		]);
	});

	test("retorna vacio cuando falta configuracion", async () => {
		const client = new GoogleCustomSearchClient(
			{
				googleCseApiKey: "",
				googleCseCx: "",
				googleCseBaseUrl: "https://www.googleapis.com/customsearch/v1",
				requestTimeoutMs: 1000,
				requestRetryAttempts: 0,
			},
			async () => createResponse(200, { items: [] }),
		);

		await expect(client.searchImageBanners("Naruto")).resolves.toEqual([]);
	});

	test("reintenta errores transitorios y retorna vacio si se agotan", async () => {
		let attempts = 0;
		const client = new GoogleCustomSearchClient(
			{
				googleCseApiKey: "api-key",
				googleCseCx: "cx-id",
				googleCseBaseUrl: "https://www.googleapis.com/customsearch/v1",
				requestTimeoutMs: 1000,
				requestRetryAttempts: 1,
			},
			async () => {
				attempts += 1;
				return createResponse(429, { error: { message: "Too Many Requests" } });
			},
		);

		await expect(client.searchImageBanners("Bleach")).resolves.toEqual([]);
		expect(attempts).toBe(2);
	});
});
