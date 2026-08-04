import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { syncAnimeDetails } from "./pipelines/syncAnimeDetails";
import { syncAnimeEpisodes } from "./pipelines/syncAnimeEpisodes";
import { syncEpisodeSources } from "./pipelines/syncEpisodeSources";
import { createPipelineContext } from "./runtime";
import {
	getManualBatchManifest,
	getManualBatchTaskNames,
	runCron,
	runManualBatch,
	runTaskByName,
	type ManualBatchName,
	type TaskName,
} from "./scheduler";
import type { EpisodeDetail } from "./types/models";
import { buildAnimeSeed, humanizeAnimeId, isAnimeAv1BaseUrl, sourceOriginForBaseUrl } from "./utils/animeSeed";

type JsonObject = Record<string, unknown>;

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const asTaskName = (value: string): TaskName | null => {
	switch (value) {
		case "sync-latest-animes":
		case "sync-latest-episodes":
		case "sync-broadcast":
		case "sync-top-rated":
		case "sync-directory":
		case "sync-details-and-episodes":
		case "sync-anime-images":
		case "sync-episode-sources":
			return value;
		default:
			return null;
	}
};

const asBatchName = (value: string): ManualBatchName | null => {
	switch (value) {
		case "feed-latest":
		case "feed-secondary":
		case "directory-refresh":
		case "detail-refresh":
			return value;
		default:
			return null;
	}
};

const isAuthorizedManualRun = (c: Context) => {
	const configuredToken = asString(process.env.SCRAPER_MANUAL_RUN_TOKEN);
	if (!configuredToken) return false;

	const authorization = c.req.header("authorization");
	if (authorization?.startsWith("Bearer ")) {
		return authorization.slice("Bearer ".length) === configuredToken;
	}

	return c.req.header("x-run-once-token") === configuredToken;
};

const normalizeIdList = (
	body: JsonObject,
	singularKey: string,
	pluralKey: string,
) => {
	const ids = [
		typeof body[singularKey] === "string" ? body[singularKey] : null,
		...(Array.isArray(body[pluralKey]) ? body[pluralKey] : []),
	];

	return Array.from(
		new Set(
			ids
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter(Boolean),
		),
	);
};

const parseEpisodeNumber = (episodeId: string) => {
	const match = episodeId.match(/-(\d+)$/);
	return Number(match?.[1] || 0);
};

const parseAnimeIdFromEpisode = (episodeId: string) => {
	const match = episodeId.match(/(.+)-\d+$/);
	return match?.[1]?.trim() ?? "";
};

const buildEpisodeSeed = (episodeId: string, sourceBaseUrl?: string): EpisodeDetail | null => {
	const animeId = parseAnimeIdFromEpisode(episodeId);
	const episode = parseEpisodeNumber(episodeId);
	if (!animeId || episode <= 0) return null;

	const animeAv1 = isAnimeAv1BaseUrl(sourceBaseUrl);
	const origin = sourceOriginForBaseUrl(sourceBaseUrl);
	return {
		episodeId,
		animeId,
		episode,
		title: humanizeAnimeId(animeId),
		originalLink: animeAv1 ? `${origin}/media/${animeId}/${episode}` : `${origin}/ver/${episodeId}`,
		image: null,
	};
};

const asBoolean = (value: unknown, fallback: boolean) =>
	typeof value === "boolean" ? value : fallback;

const app = new Hono();

app.use("/*", cors());

app.get("/health", (c) => {
	return c.json({ ok: true, service: "anime-scraper-engine" });
});

app.post("/run-once", async (c) => {
	if (!isAuthorizedManualRun(c)) {
		return c.json({ error: "Unauthorized" }, { status: 401 });
	}

	const rawTaskName = c.req.query("task");
	const rawBatchName = c.req.query("batch");
	const taskName = asTaskName(rawTaskName ?? "");
	const batchName = asBatchName(rawBatchName ?? "");

	if (taskName && batchName) {
		return c.json({ error: "Provide only one of task or batch" }, { status: 400 });
	}

	if (rawTaskName && !taskName) {
		return c.json({ error: `Unknown task: ${rawTaskName}` }, { status: 400 });
	}

	if (rawBatchName && !batchName) {
		return c.json({ error: `Unknown batch: ${rawBatchName}` }, { status: 400 });
	}

	if (!taskName && !batchName) {
		return c.json({
			ok: true,
			mode: "run-plan",
			batches: getManualBatchManifest(),
		});
	}

	const ctx = createPipelineContext(process.env as unknown as Record<string, unknown>);

	if (taskName) {
		await runTaskByName(ctx, taskName);
		return c.json({ ok: true, mode: "run-task", task: taskName });
	}

	if (batchName) {
		await runManualBatch(ctx, batchName);
		return c.json({
			ok: true,
			mode: "run-batch",
			batch: batchName,
			tasks: getManualBatchTaskNames(batchName),
		});
	}

	return c.json({ error: "Provide task or batch" }, { status: 400 });
});

app.post("/cron", async (c) => {
	if (!isAuthorizedManualRun(c)) {
		return c.json({ error: "Unauthorized" }, { status: 401 });
	}

	const cronExpression = c.req.query("cron");
	if (!cronExpression) {
		return c.json({ error: "Missing cron query parameter" }, { status: 400 });
	}

	const ctx = createPipelineContext(process.env as unknown as Record<string, unknown>);
	await runCron(ctx, cronExpression);
	return c.json({ ok: true, cron: cronExpression });
});

app.post("/scrape/anime", async (c) => {
	if (!isAuthorizedManualRun(c)) {
		return c.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: JsonObject;
	try {
		body = await c.req.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return c.json({ error: "Invalid JSON body" }, { status: 400 });
		}
	} catch {
		return c.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const animeIds = normalizeIdList(body, "animeId", "animeIds");
	if (animeIds.length === 0) {
		return c.json({ error: "Provide animeId or animeIds" }, { status: 400 });
	}

	const includeDetails = asBoolean(body.includeDetails, true);
	const includeEpisodes = asBoolean(body.includeEpisodes, true);
	if (!includeDetails && !includeEpisodes) {
		return c.json(
			{ error: "At least one of includeDetails or includeEpisodes must be true" },
			{ status: 400 },
		);
	}

	const ctx = createPipelineContext(process.env as unknown as Record<string, unknown>);
	await ctx.writer.ensureAnimeRecords(
		animeIds.map((animeId) => buildAnimeSeed(animeId, undefined, ctx.config.animeFlvBaseUrl)),
	);

	if (includeDetails) {
		await syncAnimeDetails(ctx, animeIds);
	}

	if (includeEpisodes) {
		await syncAnimeEpisodes(ctx, animeIds);
	}

	return c.json({
		ok: true,
		mode: "scrape-anime",
		animeIds,
		includeDetails,
		includeEpisodes,
	});
});

app.post("/scrape/episode-sources", async (c) => {
	if (!isAuthorizedManualRun(c)) {
		return c.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: JsonObject;
	try {
		body = await c.req.json();
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			return c.json({ error: "Invalid JSON body" }, { status: 400 });
		}
	} catch {
		return c.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const episodeIds = normalizeIdList(body, "episodeId", "episodeIds");
	if (episodeIds.length === 0) {
		return c.json({ error: "Provide episodeId or episodeIds" }, { status: 400 });
	}

	const ctx = createPipelineContext(process.env as unknown as Record<string, unknown>);
	const episodeSeeds = episodeIds.map((episodeId) => buildEpisodeSeed(episodeId, ctx.config.animeFlvBaseUrl));
	if (episodeSeeds.some((episode) => !episode)) {
		return c.json(
			{ error: "Episode ids must end with a numeric suffix, for example naruto-12" },
			{ status: 400 },
		);
	}

	const episodes = episodeSeeds.filter(
		(episode): episode is EpisodeDetail => episode !== null,
	);
	await ctx.writer.ensureAnimeRecords(
		episodes.map((episode) =>
			buildAnimeSeed(episode.animeId, episode.title ?? episode.animeId, ctx.config.animeFlvBaseUrl),
		),
	);
	await ctx.writer.upsertEpisodes(episodes);
	await syncEpisodeSources(ctx, episodeIds);

	return c.json({
		ok: true,
		mode: "scrape-episode-sources",
		episodeIds,
	});
});

app.notFound((c) => {
	return c.json({ error: "Not found" }, { status: 404 });
});

export { app };
