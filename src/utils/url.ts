export const toAbsoluteUrl = (value: string, baseUrl: string) => {
	const trimmed = value.trim();
	if (!trimmed) return trimmed;

	try {
		return new URL(trimmed, baseUrl).toString();
	} catch {
		return trimmed;
	}
};
