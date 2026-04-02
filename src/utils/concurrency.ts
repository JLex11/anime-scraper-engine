export const runWithConcurrency = async <T, R>(
	items: T[],
	concurrency: number,
	handler: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
	if (items.length === 0) return []

	const safeConcurrency = Math.max(1, Math.min(concurrency, items.length))
	const results: R[] = new Array(items.length)
	let pointer = 0

	const workers = Array.from({ length: safeConcurrency }, async () => {
		while (pointer < items.length) {
			const index = pointer
			pointer += 1
			results[index] = await handler(items[index], index)
		}
	})

	await Promise.all(workers)
	return results
}
