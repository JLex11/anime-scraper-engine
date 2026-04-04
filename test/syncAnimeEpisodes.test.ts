import { describe, expect, mock, test } from "bun:test";
import { createPipelineContext, createWriterSpy } from "./pipelineTestUtils";

mock.restore();
const syncAnimeEpisodesModulePath = new URL(
	"../src/pipelines/syncAnimeEpisodes.ts",
	import.meta.url,
).href;
const { syncAnimeEpisodes } = await import(
	`${syncAnimeEpisodesModulePath}?real=1`
);

describe("syncAnimeEpisodes", () => {
	test("scrapea episodios de cada anime unico y persiste solo los nuevos", async () => {
		const writerSpy = createWriterSpy();
		const fetchedPaths: string[] = [];

		const ctx = createPipelineContext({
			writer: {
				...writerSpy.writer,
				getMaxEpisodeNumbersByAnimeIds: async () =>
					new Map([["death-note", 2]]),
			} as unknown as typeof writerSpy.writer,
			fetchHtml: async (path) => {
				fetchedPaths.push(path);
				return `
					<script>
						const episodes = [[1, "uno"], [2, "dos"], [3, "tres"]];
					</script>
				`;
			},
		});

		await syncAnimeEpisodes(ctx, ["death-note", "", "death-note"]);

		expect(fetchedPaths).toEqual(["/anime/death-note"]);
		expect(writerSpy.episodes).toHaveLength(1);
		expect(writerSpy.episodes[0]).toEqual([
			{
				episodeId: "death-note-3",
				animeId: "death-note",
				episode: 3,
				title: "death note",
				originalLink: "https://www3.animeflv.net/ver/death-note-3",
				image: null,
			},
		]);
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: "anime_episodes",
				resourceId: "death-note",
				status: "success",
				errorMessage: undefined,
			},
		]);
	});

	test("marca success sin upsert si no hay episodios nuevos", async () => {
		const writerSpy = createWriterSpy();

		const ctx = createPipelineContext({
			writer: {
				...writerSpy.writer,
				getMaxEpisodeNumbersByAnimeIds: async () =>
					new Map([["death-note", 3]]),
			} as unknown as typeof writerSpy.writer,
			fetchHtml: async () => `
				<script>
					const episodes = [[1, "uno"], [2, "dos"], [3, "tres"]];
				</script>
			`,
		});

		await syncAnimeEpisodes(ctx, ["death-note"]);

		expect(writerSpy.episodes).toHaveLength(0);
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: "anime_episodes",
				resourceId: "death-note",
				status: "success",
				errorMessage: undefined,
			},
		]);
	});

	test("marca error cuando la pagina existe pero no hay episodios parseables", async () => {
		const writerSpy = createWriterSpy();

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			fetchHtml: async () => "<div>sin script de episodios</div>",
		});

		await syncAnimeEpisodes(ctx, ["death-note"]);

		expect(writerSpy.episodes).toHaveLength(0);
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: "anime_episodes",
				resourceId: "death-note",
				status: "error",
				errorMessage: "Could not parse anime episodes",
			},
		]);
	});

	test("marca error cuando la pagina del anime no esta disponible", async () => {
		const writerSpy = createWriterSpy();

		const ctx = createPipelineContext({
			writer: writerSpy.writer,
			fetchHtml: async () => null,
		});

		await syncAnimeEpisodes(ctx, ["death-note"]);

		expect(writerSpy.episodes).toHaveLength(0);
		expect(writerSpy.syncStates).toEqual([
			{
				resourceType: "anime_episodes",
				resourceId: "death-note",
				status: "error",
				errorMessage: "Anime episode page unavailable",
			},
		]);
	});
});
