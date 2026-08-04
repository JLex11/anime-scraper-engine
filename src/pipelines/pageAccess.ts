import type { PipelineContext } from "./context";
import { isAnimeAv1BaseUrl } from "../utils/animeSeed";

export const loadHomepage = (ctx: PipelineContext) =>
	ctx.pageLoader?.getHomepage() ?? ctx.fetchHtml("/");

export const loadAnimePage = (ctx: PipelineContext, animeId: string) =>
ctx.pageLoader?.getAnimePage(animeId) ?? ctx.fetchHtml(isAnimeAv1BaseUrl(ctx.config.animeFlvBaseUrl) ? `/media/${animeId}` : `/anime/${animeId}`);

export const loadEpisodePage = (ctx: PipelineContext, episodeId: string) =>
ctx.pageLoader?.getEpisodePage(episodeId) ?? ctx.fetchHtml(
	isAnimeAv1BaseUrl(ctx.config.animeFlvBaseUrl)
		? (() => {
			const match = episodeId.match(/^(.+)-(\d+)$/);
			return match ? `/media/${match[1]}/${match[2]}` : `/media/${episodeId}`;
		})()
		: `/ver/${episodeId}`,
);

export const loadDirectoryPage = (ctx: PipelineContext, page: number) =>
	ctx.pageLoader?.getDirectoryPage(page) ?? ctx.fetchHtml(isAnimeAv1BaseUrl(ctx.config.animeFlvBaseUrl) ? `/catalogo?page=${page}` : `/browse?page=${page}`);

export const loadTopRatedPage = (ctx: PipelineContext) =>
	ctx.pageLoader?.getTopRatedPage() ??
	ctx.fetchHtml(isAnimeAv1BaseUrl(ctx.config.animeFlvBaseUrl) ? "/catalogo?order=score" : "/browse?status=1&order=rating");
