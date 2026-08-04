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

const extractNewSiteValue = (html: string, pattern: RegExp) => html.match(pattern)?.[1] ?? null

const newSiteStatus = (value: string | null) => {
	switch (value) {
		case '0': return 'Finalizado'
		case '1': return 'Próximamente'
		case '2': return 'En emisión'
		default: return null
	}
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
	const relatedAnimeTitles = new Map<string, string>()

	const rewriter = new HTMLRewriter()
		.on('.Ficha h1, h1.Title, h1', {
			text(textChunk) {
				title += textChunk.text
			},
		})
		.on('.Ficha .Description p, .Description p, .entry p', {
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
		.on('.AnimeCover img, .Image img, img[alt*="Poster"], img[src*="/covers/"]', {
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
		.on('.Nvgnrs a, a[href*="/catalogo?genre="]', {
			text(textChunk) {
				const value = clean(textChunk.text)
				if (value) genres.push(value)
			},
		})
		.on('.ListAnmRel li a, a[href^="/media/"]', {
			element(element) {
				const href = element.getAttribute('href')
				if (!href) return
				const relatedId = getAnimeIdFromHref(href) ?? href.match(/^\/media\/([^/]+)\/?$/)?.[1] ?? null
				if (relatedId) relatedAnimeIds.push(relatedId)
			},
		})

	await rewriter.transform(new Response(html)).text()

	const isAnimeAv1 = /data\s*:\s*\{\s*media\s*:/.test(html)
	if (isAnimeAv1) {
		const categoryName = extractNewSiteValue(html, /category\s*:\s*\{[^}]*name\s*:\s*"([^"]+)"/)
		if (categoryName) animeType = categoryName
		const statusValue = extractNewSiteValue(html, /status\s*:\s*(\d+)/)
		if (statusValue) status = newSiteStatus(statusValue) ?? status

		const akaBlock = extractNewSiteValue(html, /aka\s*:\s*\{([^}]*)\}/)
		if (akaBlock) {
			for (const match of akaBlock.matchAll(/"[^"]+":"([^"]+)"/g)) {
				if (match[1]) otherTitles.push(match[1])
			}
		}

		const relationBlock = html.match(/relations\s*:\s*\[([\s\S]*?)\]\}/)?.[1] ?? ''
		for (const match of relationBlock.matchAll(/destination\s*:\s*\{[^}]*slug\s*:\s*"([^"]+)"[^}]*title\s*:\s*"([^"]+)"/g)) {
			if (match[1]) {
				relatedAnimeIds.push(match[1])
				relatedAnimeTitles.set(match[1], match[2])
			}
		}
	}

	const normalizedTitle = clean(title)
	if (!normalizedTitle) {
		return null
	}

	return {
		animeId,
		title: normalizedTitle,
		otherTitles: Array.from(new Set(otherTitles.filter((value) => value && value !== normalizedTitle))),
		description: clean(description) || null,
		originalLink: isAnimeAv1
			? `https://animeav1.com/media/${animeId}`
			: `https://www3.animeflv.net/anime/${animeId}`,
		status: clean(status) || null,
		type: animeType,
		genres: genres.length > 0 ? genres : null,
		images: {
			coverImage,
			carouselImages: [],
		},
		relatedAnimes: Array.from(new Set(relatedAnimeIds.filter((relatedAnimeId) => relatedAnimeId !== animeId))).map((relatedAnimeId) => ({
			animeId: relatedAnimeId,
			title: relatedAnimeTitles.get(relatedAnimeId) ?? relatedAnimeId.replaceAll('-', ' '),
			relation: 'Relacionado',
		})),
	}
}
