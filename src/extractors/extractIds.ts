const toAnimeId = (href: string | null) => {
	if (!href) return null
	const cleanHref = href.split(/[?#]/)[0]
	const legacyMatch = cleanHref.match(/^\/anime\/([^/]+)\/?$/)
	if (legacyMatch?.[1]) return legacyMatch[1]
	const animeAv1Match = cleanHref.match(/^\/media\/([^/]+)\/?$/)
	return animeAv1Match?.[1] ?? null
}

const toEpisodeId = (href: string | null) => {
	if (!href) return null
	const cleanHref = href.split(/[?#]/)[0]
	const legacyMatch = cleanHref.match(/^\/ver\/([^/]+)\/?$/)
	if (legacyMatch?.[1]) return legacyMatch[1]
	const animeAv1Match = cleanHref.match(/^\/media\/([^/]+)\/(\d+)\/?$/)
	return animeAv1Match ? `${animeAv1Match[1]}-${animeAv1Match[2]}` : null
}

const extractLinks = async (html: string, selector: string) => {
	const links: string[] = []

	const rewriter = new HTMLRewriter().on(selector, {
		element(element) {
			const href = element.getAttribute('href')
			if (href) links.push(href)
		},
	})

	await rewriter.transform(new Response(html)).text()
	return links
}

export const extractAnimeIds = async (html: string, selector = 'ul.ListAnimes li a') => {
	const isAnimeAv1 = html.includes('href="/media/') || html.includes("href='/media/") || html.includes('data:{media:')
	if (isAnimeAv1 && /media\s*:\s*\[/.test(html) && selector.includes('article')) {
		return Array.from(new Set(Array.from(html.matchAll(/slug:"([^"]+)"/g)).map((match) => match[1])))
	}
	if (isAnimeAv1 && selector === 'ul.ListAnimes li a') {
		const links = await extractLinks(html, 'section.from-mute article a[href^="/media/"]')
		return Array.from(new Set(links.map(toAnimeId).filter(Boolean) as string[]))
	}

	let links = await extractLinks(html, selector)
	let animeIds = links.map(toAnimeId).filter(Boolean) as string[]
	if (animeIds.length === 0 && selector === 'ul.ListAnimes li a') {
		links = await extractLinks(html, 'a[href]')
		animeIds = links.map(toAnimeId).filter(Boolean) as string[]
	}
	return Array.from(new Set(animeIds))
}

export const extractEpisodeIds = async (html: string, selector = 'ul.ListEpisodios li a') => {
	const isAnimeAv1 = html.includes('href="/media/') || html.includes("href='/media/") || html.includes('data:{media:')
	if (isAnimeAv1 && selector === 'ul.ListEpisodios li a') {
		const links = await extractLinks(html, 'section.from-mute article a[href^="/media/"]')
		return Array.from(new Set(links.map(toEpisodeId).filter(Boolean) as string[]))
	}

	let links = await extractLinks(html, selector)
	let episodeIds = links.map(toEpisodeId).filter(Boolean) as string[]
	if (episodeIds.length === 0 && selector === 'ul.ListEpisodios li a') {
		links = await extractLinks(html, 'a[href]')
		episodeIds = links.map(toEpisodeId).filter(Boolean) as string[]
	}
	return Array.from(new Set(episodeIds))
}
