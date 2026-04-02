const toAnimeId = (href: string | null) => {
	if (!href) return null
	const cleanHref = href.split('?')[0]
	const match = cleanHref.match(/\/anime\/([^/]+)/)
	return match?.[1] ?? null
}

const toEpisodeId = (href: string | null) => {
	if (!href) return null
	const cleanHref = href.split('?')[0]
	const match = cleanHref.match(/\/ver\/([^/]+)/)
	return match?.[1] ?? null
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
	const links = await extractLinks(html, selector)
	const animeIds = links.map(toAnimeId).filter(Boolean) as string[]
	return Array.from(new Set(animeIds))
}

export const extractEpisodeIds = async (html: string, selector = 'ul.ListEpisodios li a') => {
	const links = await extractLinks(html, selector)
	const episodeIds = links.map(toEpisodeId).filter(Boolean) as string[]
	return Array.from(new Set(episodeIds))
}
