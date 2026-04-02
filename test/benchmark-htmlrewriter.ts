import { extractAnimeIds } from '../src/extractors/extractIds'

const SAMPLE_SIZE = 100

const sampleHtml = `
<ul class="ListAnimes">
  ${Array.from({ length: SAMPLE_SIZE }, (_, index) => `<li><a href="/anime/anime-${index}">Anime ${index}</a></li>`).join('\n')}
</ul>
`

const started = performance.now()
const ids = await extractAnimeIds(sampleHtml)
const ended = performance.now()

console.log(JSON.stringify({
	extractor: 'HTMLRewriter',
	inputSize: SAMPLE_SIZE,
	outputSize: ids.length,
	durationMs: Number((ended - started).toFixed(2)),
}, null, 2))
