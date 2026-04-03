import type { AnimeDetail } from '../types/models'

const clean = (value: string) => value.replace(/\s+/g, ' ').trim()
const getAnimeIdFromHref = (href: string) => href.match(/\/anime\/([^/?#]+)/)?.[1] ?? null
const TYPE_MAP: Record<string, string> = {
	tv: 'TV',
	movie: 'Movie',
	ova: 'OVA',
	ona: 'ONA',
	special: 'Special',
}

export const extractAnimeDetail = async (animeId: string, html: string): Promise<AnimeDetail | null> => {
	let title = ''
	let description = ''
	let coverImage: string | null = null
	let animeType: string | null = null
	let status = ''
	const genres: string[] = []
	const otherTitles: string[] = []
	const relatedAnimeIds: string[] = []

	const rewriter = new HTMLRewriter()
		.on('.Ficha h1, h1.Title', {
			text(textChunk) {
				title += textChunk.text
			},
		})
		.on('.Ficha .Description p, .Description p', {
			text(textChunk) {
				description += textChunk.text
			},
		})
		.on('.Ficha .TxtAlt', {
			text(textChunk) {
				const value = clean(textChunk.text)
				if (value) otherTitles.push(value)
			},
		})
		.on('.AnimeCover img, .Image img', {
			element(element) {
				const src = element.getAttribute('src')
				if (src) {
					coverImage = src.startsWith('//') ? `https:${src}` : src
				}
			},
		})
		.on('.Ficha .Type', {
			element(element) {
				if (animeType) return
				const className = element.getAttribute('class') ?? ''
				for (const token of className.split(/\s+/)) {
					const mapped = TYPE_MAP[token.toLowerCase()]
					if (mapped) {
						animeType = mapped
						break
					}
				}
			},
		})
		.on('.AnmStts', {
			text(textChunk) {
				status += textChunk.text
			},
		})
		.on('.Nvgnrs a', {
			text(textChunk) {
				const value = clean(textChunk.text)
				if (value) genres.push(value)
			},
		})
		.on('.ListAnmRel li a', {
			element(element) {
				const href = element.getAttribute('href')
				if (!href) return
				const relatedId = getAnimeIdFromHref(href)
				if (relatedId) relatedAnimeIds.push(relatedId)
			},
		})

	await rewriter.transform(new Response(html)).text()

	const normalizedTitle = clean(title)
	if (!normalizedTitle) {
		return null
	}

	return {
		animeId,
		title: normalizedTitle,
		otherTitles: Array.from(new Set(otherTitles.filter((value) => value && value !== normalizedTitle))),
		description: clean(description) || null,
		originalLink: `https://www3.animeflv.net/anime/${animeId}`,
		status: clean(status) || null,
		type: animeType,
		genres: genres.length > 0 ? genres : null,
		images: {
			coverImage,
			carouselImages: [],
		},
		relatedAnimes: Array.from(new Set(relatedAnimeIds)).map((relatedAnimeId) => ({
			animeId: relatedAnimeId,
			title: relatedAnimeId.replaceAll('-', ' '),
			relation: 'Relacionado',
		})),
	}
}
