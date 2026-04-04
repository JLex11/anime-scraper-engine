import type { PipelineContext } from "./context";

export const loadHomepage = (ctx: PipelineContext) =>
	ctx.pageLoader?.getHomepage() ?? ctx.fetchHtml("/");

export const loadAnimePage = (ctx: PipelineContext, animeId: string) =>
	ctx.pageLoader?.getAnimePage(animeId) ?? ctx.fetchHtml(`/anime/${animeId}`);

export const loadEpisodePage = (ctx: PipelineContext, episodeId: string) =>
	ctx.pageLoader?.getEpisodePage(episodeId) ?? ctx.fetchHtml(`/ver/${episodeId}`);

export const loadDirectoryPage = (ctx: PipelineContext, page: number) =>
	ctx.pageLoader?.getDirectoryPage(page) ?? ctx.fetchHtml(`/browse?page=${page}`);

export const loadTopRatedPage = (ctx: PipelineContext) =>
	ctx.pageLoader?.getTopRatedPage() ??
	ctx.fetchHtml("/browse?status=1&order=rating");
