import type { GoogleImageSearchResult } from "../clients/googleCustomSearchClient";
import type { AnimeCarouselMeta, AnimeDetail } from "../types/models";
import { runWithConcurrency } from "../utils/concurrency";
import type { PipelineContext } from "./context";

const RESOURCE_TYPE = "anime_carousel_images";
const TARGET_BANNERS = 3;
const REFRESH_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;
const PIPELINE_CONCURRENCY = 2;
const SEARCH_RESULTS_LIMIT = 10;
const SEARCH_CANDIDATE_POOL = 12;
const BACKOFF_DAYS = [1, 3, 7, 14];

type PersistedBanner = {
	link: string;
	key: string;
	width: number;
	height: number;
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const toIso = (date: Date) => date.toISOString();

const withDays = (date: Date, days: number) =>
	new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const isFreshSuccess = (
	lastSuccessAt: string | null | undefined,
	now: Date,
) => {
	if (!lastSuccessAt) return false;
	const lastSuccessMs = new Date(lastSuccessAt).getTime();
	if (!Number.isFinite(lastSuccessMs)) return false;
	return now.getTime() - lastSuccessMs < REFRESH_INTERVAL_MS;
};

const isBlockedByNextRun = (
	nextRunAt: string | null | undefined,
	now: Date,
) => {
	if (!nextRunAt) return false;
	const nextRunMs = new Date(nextRunAt).getTime();
	return Number.isFinite(nextRunMs) && nextRunMs > now.getTime();
};

const getBackoffDays = (errorCount: number) => {
	const safeCount = Math.max(1, errorCount);
	const index = Math.min(safeCount - 1, BACKOFF_DAYS.length - 1);
	return BACKOFF_DAYS[index];
};

const buildQueries = (meta: AnimeCarouselMeta) => {
	const values = [meta.title, ...(meta.otherTitles ?? [])];
	return Array.from(
		new Set(values.map((value) => normalizeText(value)).filter(Boolean)),
	);
};

const mapExistingBanners = (meta: AnimeCarouselMeta): PersistedBanner[] => {
	const carouselImages = meta.images?.carouselImages ?? [];
	const carouselKeys = meta.carouselImageKeys ?? [];
	const count = Math.min(carouselImages.length, carouselKeys.length);
	const existing: PersistedBanner[] = [];

	for (let index = 0; index < count; index += 1) {
		const image = carouselImages[index];
		const key = carouselKeys[index]?.trim() ?? "";
		const link = image?.link?.trim() ?? "";
		if (!key || !link) continue;

		existing.push({
			key,
			link,
			width: Number.isFinite(image.width) && image.width > 0 ? image.width : 1,
			height:
				Number.isFinite(image.height) && image.height > 0 ? image.height : 1,
		});
	}

	return existing;
};

const mergeBanners = (
	existing: PersistedBanner[],
	incoming: PersistedBanner[],
) => {
	const byKey = new Map<string, PersistedBanner>();

	for (const banner of existing) {
		if (!byKey.has(banner.key)) {
			byKey.set(banner.key, banner);
		}
	}

	for (const banner of incoming) {
		if (!byKey.has(banner.key)) {
			byKey.set(banner.key, banner);
		}
	}

	return Array.from(byKey.values()).slice(0, TARGET_BANNERS);
};

const areSameKeyList = (left: string[], right: string[]) => {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
};

const toCarouselImages = (
	coverImage: string | null,
	banners: PersistedBanner[],
): NonNullable<AnimeDetail["images"]> => ({
	coverImage,
	carouselImages: banners.map((banner, index) => ({
		link: banner.link,
		position: String(index + 1),
		width: banner.width,
		height: banner.height,
	})),
});

const findCandidates = async (ctx: PipelineContext, queries: string[]) => {
	const candidates: GoogleImageSearchResult[] = [];
	const seenLinks = new Set<string>();

	for (const query of queries) {
		if (candidates.length >= SEARCH_CANDIDATE_POOL) break;

		const results = await ctx.googleSearchClient?.searchImageBanners(
			query,
			SEARCH_RESULTS_LIMIT,
		);
		for (const result of results ?? []) {
			if (seenLinks.has(result.link)) continue;
			seenLinks.add(result.link);
			candidates.push(result);
			if (candidates.length >= SEARCH_CANDIDATE_POOL) break;
		}
	}

	return candidates;
};

const mirrorCandidates = async (
	ctx: PipelineContext,
	animeId: string,
	candidates: GoogleImageSearchResult[],
	existingCount: number,
) => {
	const mirrored: PersistedBanner[] = [];
	const seenKeys = new Set<string>();

	for (const candidate of candidates) {
		if (existingCount + mirrored.length >= TARGET_BANNERS) break;

		try {
			const result = await ctx.r2Writer?.mirrorFromUrl(
				candidate.link,
				`animes/${animeId}/carousel`,
			);
			if (!result?.key || !result.url || seenKeys.has(result.key)) continue;

			seenKeys.add(result.key);
			mirrored.push({
				link: result.url,
				key: result.key,
				width: candidate.width,
				height: candidate.height,
			});
		} catch (error) {
			ctx.logger.warn("syncAnimeImages: mirror failed", {
				animeId,
				link: candidate.link,
				error: String(error),
			});
		}
	}

	return mirrored;
};

const markSuccess = async (
	ctx: PipelineContext,
	animeId: string,
	now: Date,
) => {
	await ctx.writer.upsertSyncState({
		resourceType: RESOURCE_TYPE,
		resourceId: animeId,
		status: "success",
		lastSuccessAt: toIso(now),
		lastErrorAt: null,
		errorCount: 0,
		errorMessage: null,
		nextRunAt: toIso(withDays(now, 14)),
	});
};

const markErrorWithBackoff = async (
	ctx: PipelineContext,
	animeId: string,
	now: Date,
	previousErrorCount: number,
	errorMessage: string,
	lastSuccessAt: string | null | undefined,
) => {
	const nextErrorCount = previousErrorCount + 1;
	const retryInDays = getBackoffDays(nextErrorCount);

	await ctx.writer.upsertSyncState({
		resourceType: RESOURCE_TYPE,
		resourceId: animeId,
		status: "error",
		lastSuccessAt: lastSuccessAt ?? null,
		lastErrorAt: toIso(now),
		errorCount: nextErrorCount,
		errorMessage,
		nextRunAt: toIso(withDays(now, retryInDays)),
	});
};

const syncOneAnime = async (
	ctx: PipelineContext,
	animeId: string,
	now: Date,
) => {
	const meta = await ctx.writer.getAnimeCarouselMeta(animeId);
	if (!meta?.title) {
		await markErrorWithBackoff(
			ctx,
			animeId,
			now,
			0,
			"Anime record not found",
			null,
		);
		return;
	}

	const syncState = await ctx.writer.getSyncState(RESOURCE_TYPE, animeId);
	if (isBlockedByNextRun(syncState?.nextRunAt, now)) {
		return;
	}

	const existing = mapExistingBanners(meta);
	if (existing.length > 0 && isFreshSuccess(syncState?.lastSuccessAt, now)) {
		return;
	}

	if (!ctx.r2Writer?.isEnabled()) {
		if (existing.length > 0) {
			await markSuccess(ctx, animeId, now);
			return;
		}

		await markErrorWithBackoff(
			ctx,
			animeId,
			now,
			syncState?.errorCount ?? 0,
			"R2 mirror is required for carousel images",
			syncState?.lastSuccessAt,
		);
		return;
	}

	const queries = buildQueries(meta);
	const candidates = await findCandidates(ctx, queries);
	const mirrored = await mirrorCandidates(
		ctx,
		animeId,
		candidates,
		existing.length,
	);
	const merged = mergeBanners(existing, mirrored);

	if (merged.length === 0) {
		await markErrorWithBackoff(
			ctx,
			animeId,
			now,
			syncState?.errorCount ?? 0,
			"No mirrored carousel images available",
			syncState?.lastSuccessAt,
		);
		return;
	}

	const mergedKeys = merged.map((banner) => banner.key);
	const shouldPersist = !areSameKeyList(
		existing.map((banner) => banner.key),
		mergedKeys,
	);

	if (shouldPersist) {
		await ctx.writer.updateAnimeCarouselImages(
			animeId,
			toCarouselImages(meta.images?.coverImage ?? null, merged),
			mergedKeys,
		);
	}

	await markSuccess(ctx, animeId, now);
};

export const syncAnimeImages = async (
	ctx: PipelineContext,
	animeIds: string[],
	now = new Date(),
) => {
	const uniqueIds = Array.from(new Set(animeIds)).filter(Boolean);
	if (uniqueIds.length === 0) return;

	await runWithConcurrency(
		uniqueIds,
		Math.min(ctx.config.maxConcurrency, PIPELINE_CONCURRENCY),
		async (animeId) => {
			try {
				await syncOneAnime(ctx, animeId, now);
			} catch (error) {
				const previous = await ctx.writer.getSyncState(RESOURCE_TYPE, animeId);
				await markErrorWithBackoff(
					ctx,
					animeId,
					now,
					previous?.errorCount ?? 0,
					String(error),
					previous?.lastSuccessAt,
				);
			}
		},
	);
};
