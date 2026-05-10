/**
 * Parse a .env file into a flat key/value map.
 *
 * Supports the common subset of dotenv syntax:
 * - `KEY=value` and `KEY="value"` and `KEY='value'`
 * - Comments starting with `#` (line-leading or after a value)
 * - Multi-line values via `\n` escapes inside double-quoted strings
 * - Blank lines
 *
 * Does NOT support: variable interpolation (`${VAR}`), command substitution,
 * or shell-style heredocs. Keep .env files simple.
 *
 * @internal
 */
export function parseDotenv(content: string): Record<string, string> {
	const out: Record<string, string> = {};

	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#")) continue;

		const eq = line.indexOf("=");
		if (eq === -1) continue;

		const key = line.slice(0, eq).trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

		let value = line.slice(eq + 1).trim();

		// Strip inline comment if present and value isn't quoted
		if (!value.startsWith('"') && !value.startsWith("'")) {
			const hashIdx = value.indexOf(" #");
			if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
		}

		// Unquote
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			const quote = value[0];
			value = value.slice(1, -1);
			// Only double-quoted strings interpret escape sequences
			if (quote === '"') {
				value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
			}
		}

		out[key] = value;
	}

	return out;
}
