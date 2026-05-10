/**
 * Build a fully-qualified URL from base + path + query.
 *
 * Behaviour rules:
 * - If `path` is already absolute (starts with `http://` or `https://`),
 *   it is used as-is and `baseUrl` is ignored.
 * - `baseUrl` and `path` are joined with exactly one `/` between them.
 * - Query values that are `undefined` are omitted (useful for optional filters).
 * - All other query values are coerced via `String(value)`.
 *
 * @internal
 */
export function buildUrl(
	baseUrl: string | undefined,
	path: string,
	query: Record<string, string | number | boolean | undefined> | undefined,
): string {
	let url: string;

	if (path.startsWith("http://") || path.startsWith("https://")) {
		url = path;
	} else if (baseUrl) {
		const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
		const suffix = path.startsWith("/") ? path : `/${path}`;
		url = `${base}${suffix}`;
	} else {
		url = path;
	}

	if (!query) return url;

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) {
			params.append(key, String(value));
		}
	}
	const queryString = params.toString();
	if (!queryString) return url;

	return url.includes("?") ? `${url}&${queryString}` : `${url}?${queryString}`;
}
