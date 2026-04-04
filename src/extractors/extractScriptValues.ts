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

const parseScriptAssignmentFromBody = <T>(scriptBody: string, variableName: string): T | null => {
	const regex = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*([\\s\\S]*?);`)
	const match = scriptBody.match(regex)
	if (!match?.[1]) return null

	try {
		return JSON.parse(match[1]) as T
	} catch {
		return null
	}
}

export const parseScriptAssignment = async <T>(html: string, variableName: string): Promise<T | null> => {
	const scriptBody = await collectScriptText(html)
	return parseScriptAssignmentFromBody(scriptBody, variableName)
}

export const extractEpisodeNumbers = async (html: string): Promise<number[]> => {
	const episodes = await parseScriptAssignment<Array<[number, string]>>(html, 'episodes')
	if (!episodes) return []
	return Array.from(
		new Set(
			episodes
				.map(([episode]) => episode)
				.filter((episode) => Number.isInteger(episode) && episode > 0)
		)
	)
}

export const extractEpisodeVideos = async (html: string) => {
	const scriptBody = await collectScriptText(html)
	const episode = parseScriptAssignmentFromBody<number | string>(scriptBody, 'episode_number')
	const videos = parseScriptAssignmentFromBody<unknown>(scriptBody, 'videos')
	const normalizedEpisode =
		typeof episode === 'string' ? Number(episode) : typeof episode === 'number' ? episode : 0

	return {
		episode: Number.isFinite(normalizedEpisode) ? normalizedEpisode : 0,
		videos: videos ?? [],
	}
}
