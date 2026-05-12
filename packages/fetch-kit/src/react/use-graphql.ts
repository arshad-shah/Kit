import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, GraphQLOptions } from "../types.js";

/**
 * Options for {@link useGraphQL}.
 */
export type UseGraphQLOptions<TData, TVariables> = GraphQLOptions<TData, TVariables> & {
	/** When `false`, the query will not run automatically. Defaults to `true`. */
	enabled?: boolean;
	/** Dependencies that, when changed, trigger a refetch. */
	deps?: ReadonlyArray<unknown>;
};

/**
 * State returned by {@link useGraphQL}.
 */
export type UseGraphQLState<TData> = {
	data: TData | undefined;
	error: unknown;
	loading: boolean;
	refetch: () => Promise<void>;
};

/**
 * React hook for declarative GraphQL queries.
 *
 * Behaves like {@link useFetch}: aborts on unmount or dep change, skips state
 * updates after unmount, and re-runs when `deps` change. Pairs well with the
 * client's response cache + dedupe — multiple components requesting the same
 * query share one in-flight request and one cache entry.
 *
 * @typeParam TData - Expected `data` shape
 * @typeParam TVariables - Variables shape
 *
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useGraphQL<{ me: User }>(
 *   api,
 *   `query Me { me { id name } }`,
 * );
 * ```
 */
export function useGraphQL<TData = unknown, TVariables = Record<string, unknown>>(
	client: Client,
	query: string,
	options: UseGraphQLOptions<TData, TVariables> = {},
): UseGraphQLState<TData> {
	const { enabled = true, deps = [], ...graphqlOptions } = options;

	const [data, setData] = useState<TData | undefined>(undefined);
	const [error, setError] = useState<unknown>(undefined);
	const [loading, setLoading] = useState<boolean>(enabled);

	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const optionsRef = useRef(graphqlOptions);
	optionsRef.current = graphqlOptions;

	const execute = useCallback(async (): Promise<void> => {
		const controller = new AbortController();
		setLoading(true);
		setError(undefined);
		try {
			const result = await client.graphql<TData, TVariables>(query, {
				...optionsRef.current,
				signal: controller.signal,
			});
			if (mountedRef.current) {
				setData(result);
				setError(undefined);
			}
		} catch (err) {
			if (mountedRef.current) {
				setError(err);
			}
		} finally {
			if (mountedRef.current) {
				setLoading(false);
			}
		}
		// deps are user-supplied; intentionally non-static.
	}, [client, query, ...deps]);

	useEffect(() => {
		if (!enabled) {
			setLoading(false);
			return;
		}
		void execute();
	}, [enabled, execute]);

	return { data, error, loading, refetch: execute };
}
