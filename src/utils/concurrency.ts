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

export const createConcurrencyLimiter = (concurrency: number) => {
	const safeConcurrency = Math.max(1, concurrency)
	let activeCount = 0
	const queue: Array<() => void> = []

	const runNext = () => {
		if (activeCount >= safeConcurrency) return
		const next = queue.shift()
		if (!next) return
		activeCount += 1
		next()
	}

	return async <T>(task: () => Promise<T>): Promise<T> => {
		return new Promise<T>((resolve, reject) => {
			const runTask = async () => {
				try {
					resolve(await task())
				} catch (error) {
					reject(error)
				} finally {
					activeCount -= 1
					runNext()
				}
			}

			queue.push(runTask)
			runNext()
		})
	}
}
