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
	if (episodes) return Array.from(
		new Set(
			episodes
				.map(([episode]) => episode)
				.filter((episode) => Number.isInteger(episode) && episode > 0)
		)
	)

	// AnimeAV1 serializes its Svelte data as a JavaScript object literal rather
	// than the JSON assignment used by AnimeFLV.
	return Array.from(new Set(Array.from(html.matchAll(/\{\s*id:\s*\d+\s*,\s*number:\s*(\d+)\s*\}/g))
		.map((match) => Number(match[1]))
		.filter((episode) => Number.isInteger(episode) && episode > 0)))
}

export const extractEpisodeVideos = async (html: string) => {
	const scriptBody = await collectScriptText(html)
	const episode = parseScriptAssignmentFromBody<number | string>(scriptBody, 'episode_number')
	const videos = parseScriptAssignmentFromBody<unknown>(scriptBody, 'videos')
	const normalizedEpisode =
		typeof episode === 'string' ? Number(episode) : typeof episode === 'number' ? episode : 0

	if (videos != null || episode || /episode_number/.test(scriptBody)) {
		return {
			episode: Number.isFinite(normalizedEpisode) ? normalizedEpisode : 0,
			videos: videos ?? [],
		}
	}

	const embedsBlock = scriptBody.match(/embeds\s*:\s*\{([\s\S]*?)\}\s*,\s*downloads\s*:/)?.[1] ?? ''
	const sources = Array.from(embedsBlock.matchAll(/server\s*:\s*"([^"]+)"\s*,\s*url\s*:\s*"([^"]+)"/g))
		.map((match) => ({ server: match[1], url: match[2] }))
	const newEpisode = Number(scriptBody.match(/episode\s*:\s*\{[^}]*number\s*:\s*(\d+)/)?.[1] ?? 0)

	return {
		episode: Number.isFinite(newEpisode) ? newEpisode : 0,
		videos: sources.length > 0 ? { SUB: sources } : [],
	}
}
