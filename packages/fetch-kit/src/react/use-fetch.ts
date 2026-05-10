import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, RequestOptions } from "../types.js";

/**
 * State returned by {@link useFetch}.
 */
export type UseFetchState<T> = {
	data: T | undefined;
	error: unknown;
	loading: boolean;
	refetch: () => Promise<void>;
};

/**
 * Options for {@link useFetch}.
 */
export type UseFetchOptions<T> = RequestOptions<T> & {
	/** When `false`, the request will not run automatically. Defaults to `true`. */
	enabled?: boolean;
	/** Dependencies that, when changed, trigger a refetch. */
	deps?: ReadonlyArray<unknown>;
};

/**
 * React hook for declarative GET requests.
 *
 * The request is automatically aborted if the component unmounts or if the
 * dependencies change before completion. State updates are skipped after unmount
 * to avoid React warnings.
 *
 * @typeParam T - Expected response type
 * @param client - Client instance from `createClient`
 * @param path - Request path (relative or absolute)
 * @param options - Request options including `enabled` and `deps`
 *
 * @example
 * ```tsx
 * const { data, error, loading, refetch } = useFetch<User>(api, "/users/me");
 *
 * if (loading) return <Spinner />;
 * if (error) return <Error error={error} onRetry={refetch} />;
 * return <Profile user={data!} />;
 * ```
 */
export function useFetch<T>(
	client: Client,
	path: string,
	options: UseFetchOptions<T> = {},
): UseFetchState<T> {
	const { enabled = true, deps = [], ...requestOptions } = options;

	const [data, setData] = useState<T | undefined>(undefined);
	const [error, setError] = useState<unknown>(undefined);
	const [loading, setLoading] = useState<boolean>(enabled);

	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Stash request options in a ref so the request function stays referentially
	// stable. Refetch behaviour is controlled explicitly by `deps`, not by every
	// option's identity.
	const optionsRef = useRef(requestOptions);
	optionsRef.current = requestOptions;

	const execute = useCallback(async (): Promise<void> => {
		const controller = new AbortController();
		setLoading(true);
		setError(undefined);
		try {
			const result = await client.get<T>(path, {
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
	}, [client, path, ...deps]);

	useEffect(() => {
		if (!enabled) {
			setLoading(false);
			return;
		}
		void execute();
	}, [enabled, execute]);

	return { data, error, loading, refetch: execute };
}
