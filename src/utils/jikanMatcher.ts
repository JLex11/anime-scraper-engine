import type { JikanAnimeSearchResult } from '../clients/jikanClient'

export type JikanMatch = {
	result: JikanAnimeSearchResult
	matchedTitle: string
	score: number
	typeMatched: boolean
}

const TYPE_MAP: Record<string, string> = {
	anime: 'TV',
	tv: 'TV',
	pelicula: 'Movie',
	película: 'Movie',
	movie: 'Movie',
	ova: 'OVA',
	ona: 'ONA',
	special: 'Special',
	especial: 'Special',
}

export const normalizeTitle = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ')

const tokenize = (value: string) => normalizeTitle(value).split(' ').filter(Boolean)

const diceCoefficient = (left: string[], right: string[]) => {
	if (left.length === 0 || right.length === 0) return 0

	const leftCounts = new Map<string, number>()
	for (const token of left) {
		leftCounts.set(token, (leftCounts.get(token) ?? 0) + 1)
	}

	let overlap = 0
	for (const token of right) {
		const count = leftCounts.get(token) ?? 0
		if (count > 0) {
			overlap += 1
			leftCounts.set(token, count - 1)
		}
	}

	return (2 * overlap) / (left.length + right.length)
}

const containmentScore = (left: string, right: string) => {
	if (!left || !right) return 0
	if (left === right) return 1
	if (left.includes(right) || right.includes(left)) {
		const shortest = Math.min(left.length, right.length)
		const longest = Math.max(left.length, right.length)
		return shortest / longest
	}
	return 0
}

export const normalizeAnimeType = (value?: string | null) => {
	if (!value) return null
	const normalized = normalizeTitle(value)
	return TYPE_MAP[normalized] ?? value.trim()
}

const getTitleVariants = (result: JikanAnimeSearchResult) => {
	const variants = [result.title, result.title_english, result.title_japanese, ...result.titles.map((entry) => entry.title)]
	return Array.from(new Set(variants.filter((value): value is string => Boolean(value?.trim()))))
}

const scoreTitleVariant = (query: string, candidate: string) => {
	const normalizedQuery = normalizeTitle(query)
	const normalizedCandidate = normalizeTitle(candidate)

	if (!normalizedQuery || !normalizedCandidate) return 0
	if (normalizedQuery === normalizedCandidate) return 1

	const tokenScore = diceCoefficient(tokenize(query), tokenize(candidate))
	const containsScore = containmentScore(normalizedQuery, normalizedCandidate)
	return Math.max(tokenScore, containsScore)
}

export const matchJikanAnime = (
	query: string,
	animeType: string | null | undefined,
	results: JikanAnimeSearchResult[]
): JikanMatch | null => {
	const normalizedType = normalizeAnimeType(animeType)
	let bestMatch: JikanMatch | null = null

	for (const result of results) {
		let bestTitle = result.title
		let bestTitleScore = 0

		for (const title of getTitleVariants(result)) {
			const score = scoreTitleVariant(query, title)
			if (score > bestTitleScore) {
				bestTitleScore = score
				bestTitle = title
			}
		}

		const typeMatched = Boolean(normalizedType && normalizeAnimeType(result.type) === normalizedType)
		const score = Math.min(1, bestTitleScore + (typeMatched ? 0.06 : 0))
		const candidate: JikanMatch = {
			result,
			matchedTitle: bestTitle,
			score,
			typeMatched,
		}

		if (!bestMatch || candidate.score > bestMatch.score) {
			bestMatch = candidate
		}
	}

	if (!bestMatch) return null
	if (bestMatch.score >= 0.82) return bestMatch
	if (bestMatch.score >= 0.72 && bestMatch.typeMatched) return bestMatch
	return null
}
