import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, HttpMethod, RequestOptions } from "../types.js";

/**
 * Options for {@link useMutation}.
 */
export type UseMutationOptions<TData, TVariables> = RequestOptions<TData> & {
	/** HTTP method. Defaults to `"POST"`. */
	method?: HttpMethod;
	/** Called on successful response. */
	onSuccess?: (data: TData, variables: TVariables) => void;
	/** Called when the request errors. */
	onError?: (error: unknown, variables: TVariables) => void;
	/** Called after success or error, regardless of outcome. */
	onSettled?: (data: TData | undefined, error: unknown, variables: TVariables) => void;
};

/**
 * State returned by {@link useMutation}.
 */
export type UseMutationState<TData, TVariables> = {
	data: TData | undefined;
	error: unknown;
	loading: boolean;
	mutate: (variables: TVariables) => Promise<TData>;
	reset: () => void;
};

/**
 * React hook for imperative mutations (POST, PUT, PATCH, DELETE).
 *
 * Unlike {@link useFetch}, mutations do not run on mount. The returned `mutate`
 * function accepts variables (typically the request body) and returns a promise
 * resolving to the response data, allowing both imperative and declarative use.
 *
 * @typeParam TData - Response type
 * @typeParam TVariables - Variables passed to `mutate` (usually the body)
 *
 * @example
 * ```tsx
 * const { mutate, loading, error } = useMutation<User, NewUser>(
 *   api,
 *   "/users",
 *   {
 *     method: "POST",
 *     onSuccess: (user) => router.push(`/users/${user.id}`),
 *   }
 * );
 *
 * <button onClick={() => mutate({ name, email })} disabled={loading}>
 *   Create
 * </button>
 * ```
 */
export function useMutation<TData = unknown, TVariables = unknown>(
	client: Client,
	path: string,
	options: UseMutationOptions<TData, TVariables> = {},
): UseMutationState<TData, TVariables> {
	const { method = "POST", onSuccess, onError, onSettled, ...requestOptions } = options;

	const [data, setData] = useState<TData | undefined>(undefined);
	const [error, setError] = useState<unknown>(undefined);
	const [loading, setLoading] = useState<boolean>(false);

	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Stash callbacks and options in refs so identity changes don't break referential
	// stability of `mutate`. This matters for passing `mutate` as a dependency or prop.
	const callbacksRef = useRef({ onSuccess, onError, onSettled });
	callbacksRef.current = { onSuccess, onError, onSettled };

	const optionsRef = useRef(requestOptions);
	optionsRef.current = requestOptions;

	const mutate = useCallback(
		async (variables: TVariables): Promise<TData> => {
			setLoading(true);
			setError(undefined);
			try {
				const result = await client.request<TData>(method, path, variables, optionsRef.current);
				if (mountedRef.current) {
					setData(result);
					setError(undefined);
				}
				callbacksRef.current.onSuccess?.(result, variables);
				callbacksRef.current.onSettled?.(result, undefined, variables);
				return result;
			} catch (err) {
				if (mountedRef.current) {
					setError(err);
				}
				callbacksRef.current.onError?.(err, variables);
				callbacksRef.current.onSettled?.(undefined, err, variables);
				throw err;
			} finally {
				if (mountedRef.current) {
					setLoading(false);
				}
			}
		},
		[client, path, method],
	);

	const reset = useCallback(() => {
		setData(undefined);
		setError(undefined);
		setLoading(false);
	}, []);

	return { data, error, loading, mutate, reset };
}
