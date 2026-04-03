const fixturesRoot = new URL('../fixtures/', import.meta.url)

export const loadFixture = async (relativePath: string) => {
	const fileUrl = new URL(relativePath, fixturesRoot)
	return Bun.file(fileUrl).text()
}
