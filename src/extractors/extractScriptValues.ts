const collectScriptText = async (html: string) => {
	let content = ''

	const rewriter = new HTMLRewriter().on('script', {
		text(textChunk) {
			content += textChunk.text
		},
	})

	await rewriter.transform(new Response(html)).text()
	return content
}

export const parseScriptAssignment = async <T>(html: string, variableName: string): Promise<T | null> => {
	const scriptBody = await collectScriptText(html)
	const regex = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*([\\s\\S]*?);`)
	const match = scriptBody.match(regex)
	if (!match?.[1]) return null

	try {
		return JSON.parse(match[1]) as T
	} catch {
		return null
	}
}

export const extractEpisodeNumbers = async (html: string): Promise<number[]> => {
	const episodes = await parseScriptAssignment<Array<[number, string]>>(html, 'episodes')
	if (!episodes) return []
	return episodes.map(([episode]) => episode).filter(episode => Number.isFinite(episode))
}

export const extractEpisodeVideos = async (html: string) => {
	const episode = await parseScriptAssignment<number | string>(html, 'episode_number')
	const videos = await parseScriptAssignment<unknown>(html, 'videos')

	return {
		episode: typeof episode === 'string' ? Number(episode) : (episode ?? 0),
		videos: videos ?? [],
	}
}
