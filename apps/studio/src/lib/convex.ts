import { ConvexClient } from "convex/browser";
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";

// Single shared reactive (WebSocket) client for the SPA.
export const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL as string);

type QueryRef = FunctionReference<"query">;

type ArgsOrAccessor<Q extends QueryRef> =
  | FunctionArgs<Q>
  | "skip"
  | Accessor<FunctionArgs<Q> | "skip">;

export interface QueryResult<T> {
  data: Accessor<T | undefined>;
  error: Accessor<Error | undefined>;
  loading: Accessor<boolean>;
}

/** Reactive Convex query as a Solid signal. Re-subscribes when reactive args
 *  change; tears down on dispose. Return "skip" (or pass it) to pause. */
export function createQuery<Q extends QueryRef>(
  query: Q,
  args: ArgsOrAccessor<Q> = {} as FunctionArgs<Q>,
): QueryResult<FunctionReturnType<Q>> {
  type T = FunctionReturnType<Q>;
  const [data, setData] = createSignal<T | undefined>(undefined);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [loading, setLoading] = createSignal(true);

  const resolveArgs = (): FunctionArgs<Q> | "skip" =>
    typeof args === "function" ? (args as Accessor<FunctionArgs<Q> | "skip">)() : args;

  createEffect(() => {
    const current = resolveArgs();
    if (current === "skip") {
      setLoading(false);
      setData(undefined);
      setError(undefined);
      return;
    }
    setLoading(true);
    setError(undefined);
    const unsubscribe = convex.onUpdate(
      query,
      current,
      (result) => {
        setData(() => result as T);
        setError(undefined);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
    onCleanup(() => unsubscribe());
  });

  return { data, error, loading };
}

/** One-shot mutation caller. */
export function useMutation<M extends FunctionReference<"mutation">>(mutation: M) {
  return (args: FunctionArgs<M>): Promise<FunctionReturnType<M>> =>
    convex.mutation(mutation, args);
}
