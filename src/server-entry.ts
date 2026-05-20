import { app } from "./server";
import { runScheduler, runOnce } from "./scheduler";
import { createPipelineContext } from "./runtime";

const PORT = Number(process.env.PORT) || 3000;

const main = async () => {
	const ctx = createPipelineContext(process.env as unknown as Record<string, unknown>);

	ctx.logger.info("anime-scraper-engine booting", {
		port: PORT,
		baseUrl: ctx.config.animeFlvBaseUrl,
		maxConcurrency: ctx.config.maxConcurrency,
		runOnce: ctx.config.runOnce,
		r2Enabled: ctx.r2Writer?.isEnabled() ?? false,
	});

	if (ctx.config.runOnce) {
		await runOnce(ctx);
		return;
	}

	Bun.serve({
		fetch: (req) => app.fetch(req),
		port: PORT,
	});
	ctx.logger.info(`http server listening on port ${PORT}`);

	await runScheduler(ctx);
};

void main().catch((error) => {
	console.error("[fatal]", error);
	process.exit(1);
});
