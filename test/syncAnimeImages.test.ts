import { describe, expect, test } from "bun:test";
import type { PipelineContext } from "../src/pipelines/context";
import { syncAnimeImages } from "../src/pipelines/syncAnimeImages";
import { createPipelineContext, createWriterSpy } from "./pipelineTestUtils";

const now = new Date("2026-04-04T00:00:00.000Z");

describe("syncAnimeImages", () => {
	test("persiste banners espejados a R2 y marca success", async () => {
		const writerSpy = createWriterSpy();
		writerSpy.animeCarouselMetaById.set("naruto", {
			animeId: "naruto",
			title: "Naruto",
			otherTitles: ["ナルト"],
			images: {
				coverImage: "https://cdn.example/naruto-cover.jpg",
				carouselImages: [],
			},
			carouselImageKeys: [],
		});

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			googleSearchClient: {
				searchImageBanners: async () => [
					{
						link: "https://img.example/naruto-1.jpg",
						title: null,
						mime: null,
						width: 1200,
						height: 675,
					},
					{
						link: "https://img.example/naruto-2.jpg",
						title: null,
						mime: null,
						width: 1280,
						height: 720,
					},
					{
						link: "https://img.example/naruto-3.jpg",
						title: null,
						mime: null,
						width: 1280,
						height: 720,
					},
				],
			} as unknown as PipelineContext["googleSearchClient"],
			r2Writer: {
				isEnabled: () => true,
				mirrorFromUrl: async (url: string) => ({
					url: `https://r2.example/${url.split("/").pop()}`,
					key: `animes/naruto/carousel/${url.split("/").pop()}`,
				}),
			} as unknown as NonNullable<PipelineContext["r2Writer"]>,
		});

		await syncAnimeImages(ctx, ["naruto"], now);

		expect(writerSpy.updatedCarousels).toHaveLength(1);
		expect(writerSpy.updatedCarousels[0]?.carouselImageKeys).toEqual([
			"animes/naruto/carousel/naruto-1.jpg",
			"animes/naruto/carousel/naruto-2.jpg",
			"animes/naruto/carousel/naruto-3.jpg",
		]);
		expect(writerSpy.fullSyncStates.at(-1)).toMatchObject({
			resourceType: "anime_carousel_images",
			resourceId: "naruto",
			status: "success",
			errorCount: 0,
		});
	});

	test("si queda 1 banner valido se considera success con refresh a 14 dias", async () => {
		const writerSpy = createWriterSpy();
		writerSpy.animeCarouselMetaById.set("bleach", {
			animeId: "bleach",
			title: "Bleach",
			otherTitles: [],
			images: {
				coverImage: null,
				carouselImages: [
					{
						link: "https://r2.example/bleach-1.jpg",
						position: "1",
						width: 1280,
						height: 720,
					},
				],
			},
			carouselImageKeys: ["animes/bleach/carousel/bleach-1.jpg"],
		});
		writerSpy.syncStateMetaByResource.set("anime_carousel_images:bleach", {
			resourceType: "anime_carousel_images",
			resourceId: "bleach",
			status: "success",
			lastSuccessAt: "2026-03-01T00:00:00.000Z",
			lastErrorAt: null,
			errorCount: 0,
			errorMessage: null,
			nextRunAt: null,
		});

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			googleSearchClient: {
				searchImageBanners: async () => [],
			} as unknown as PipelineContext["googleSearchClient"],
			r2Writer: {
				isEnabled: () => true,
				mirrorFromUrl: async () => ({ url: "", key: null }),
			} as unknown as NonNullable<PipelineContext["r2Writer"]>,
		});

		await syncAnimeImages(ctx, ["bleach"], now);

		expect(writerSpy.updatedCarousels).toHaveLength(0);
		expect(writerSpy.fullSyncStates.at(-1)).toMatchObject({
			resourceType: "anime_carousel_images",
			resourceId: "bleach",
			status: "success",
		});
	});

	test("marca error con backoff cuando no existe ningun banner valido", async () => {
		const writerSpy = createWriterSpy();
		writerSpy.animeCarouselMetaById.set("one-piece", {
			animeId: "one-piece",
			title: "One Piece",
			otherTitles: [],
			images: {
				coverImage: null,
				carouselImages: [],
			},
			carouselImageKeys: [],
		});

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			googleSearchClient: {
				searchImageBanners: async () => [
					{
						link: "https://img.example/op.jpg",
						title: null,
						mime: null,
						width: 1000,
						height: 500,
					},
				],
			} as unknown as PipelineContext["googleSearchClient"],
			r2Writer: {
				isEnabled: () => true,
				mirrorFromUrl: async () => {
					throw new Error("r2 down");
				},
			} as unknown as NonNullable<PipelineContext["r2Writer"]>,
		});

		await syncAnimeImages(ctx, ["one-piece"], now);

		expect(writerSpy.updatedCarousels).toHaveLength(0);
		expect(writerSpy.fullSyncStates.at(-1)).toMatchObject({
			resourceType: "anime_carousel_images",
			resourceId: "one-piece",
			status: "error",
			errorCount: 1,
		});
		expect(writerSpy.fullSyncStates.at(-1)?.nextRunAt).toBe(
			"2026-04-05T00:00:00.000Z",
		);
	});

	test("permite bucket privado y persiste keys aunque no haya url publica", async () => {
		const writerSpy = createWriterSpy();
		writerSpy.animeCarouselMetaById.set("yomi-no-tsugai", {
			animeId: "yomi-no-tsugai",
			title: "Yomi no Tsugai",
			otherTitles: [],
			images: {
				coverImage: "/uploads/animes/covers/4351.jpg",
				carouselImages: [],
			},
			carouselImageKeys: [],
		});

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			config: {
				r2PublicBaseUrl: "",
			},
			googleSearchClient: {
				searchImageBanners: async () => [
					{
						link: "https://img.example/yomi-1.jpg",
						title: null,
						mime: null,
						width: 1200,
						height: 675,
					},
				],
			} as unknown as PipelineContext["googleSearchClient"],
			r2Writer: {
				isEnabled: () => true,
				mirrorFromUrl: async () => ({
					url: "https://img.example/yomi-1.jpg",
					key: "animes/yomi-no-tsugai/carousel/yomi-1.jpg",
				}),
			} as unknown as NonNullable<PipelineContext["r2Writer"]>,
		});

		await syncAnimeImages(ctx, ["yomi-no-tsugai"], now);

		expect(writerSpy.updatedCarousels).toHaveLength(1);
		expect(writerSpy.updatedCarousels[0]?.carouselImageKeys).toEqual([
			"animes/yomi-no-tsugai/carousel/yomi-1.jpg",
		]);
		expect(
			writerSpy.updatedCarousels[0]?.images?.carouselImages?.[0]?.link,
		).toBeNull();
		expect(writerSpy.fullSyncStates.at(-1)).toMatchObject({
			resourceType: "anime_carousel_images",
			resourceId: "yomi-no-tsugai",
			status: "success",
		});
	});

	test("considera validos banners existentes con key aunque link sea null", async () => {
		const writerSpy = createWriterSpy();
		writerSpy.animeCarouselMetaById.set("gintama", {
			animeId: "gintama",
			title: "Gintama",
			otherTitles: [],
			images: {
				coverImage: "https://origin.example/gintama-cover.jpg",
				carouselImages: [
					{
						link: null,
						position: "1",
						width: 1280,
						height: 720,
					},
				],
			},
			carouselImageKeys: ["animes/gintama/carousel/banner-1.jpg"],
		});

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			googleSearchClient: {
				searchImageBanners: async () => {
					throw new Error("should not search when private banners already exist");
				},
			} as unknown as PipelineContext["googleSearchClient"],
		});

		await syncAnimeImages(ctx, ["gintama"], now);

		expect(writerSpy.updatedCarousels).toHaveLength(0);
		expect(writerSpy.fullSyncStates.at(-1)).toMatchObject({
			resourceType: "anime_carousel_images",
			resourceId: "gintama",
			status: "success",
			errorCount: 0,
		});
	});
});
