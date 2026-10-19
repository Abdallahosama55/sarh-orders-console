import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, isRetryableError } from '../lib/api-client';
import { sessionKey } from '../auth/session';

/**
 * One place that reacts to an expired or revoked session: any 401 clears the cached user,
 * and <RequireAuth> sends the agent to the login page with a `next` link back.
 * The create-order draft survives in sessionStorage, so nothing typed is lost.
 */
export function createQueryClient(options: { retry?: boolean } = {}): QueryClient {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) client.setQueryData(sessionKey, null);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry:
          options.retry === false
            ? false
            : (failureCount, error) => failureCount < 2 && isRetryableError(error),
        refetchOnWindowFocus: false,
        staleTime: 15_000,
      },
    },
  });
  return client;
}
