/**
 * Is `value` a plain object — a `{}` literal or `Object.create(null)` — as
 * opposed to an array, class instance, `Date`, function, or `null`?
 *
 * Only plain objects are deep-merged. Everything else (arrays, primitives,
 * functions, class instances) replaces wholesale, which is what config files
 * expect: you override a `plugins` array or a `dev` flag, you don't merge it.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Recursively merge `source` onto `target`, returning a new object.
 *
 * - Plain objects present in both are merged key-by-key (recursively).
 * - Arrays, primitives, functions, and class instances **replace** wholesale.
 * - `undefined` values in `source` are skipped, so a later source can't blank
 *   out an earlier one by listing a key with no value.
 *
 * Neither argument is mutated. The result is a fresh object graph for the keys
 * that were merged; replaced leaf values keep their original reference.
 */
export function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...target };
	for (const key of Object.keys(source)) {
		const incoming = source[key];
		if (incoming === undefined) continue;
		const existing = out[key];
		if (isPlainObject(existing) && isPlainObject(incoming)) {
			out[key] = deepMerge(existing, incoming);
		} else {
			out[key] = incoming;
		}
	}
	return out;
}
