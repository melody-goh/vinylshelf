import type { User } from '@vinylshelf/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, unwrap } from './client';

export const meKey = ['me'] as const;

/**
 * The signed-in user, or null when signed out. A 401 is an answer here, not an error,
 * so it is neither retried nor surfaced as a failure.
 */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return await unwrap(api.GET('/me'));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: (failures, error) => !(error instanceof ApiError) && failures < 2,
  });
}

/** Ends the session server-side, then forgets everything cached for this user. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/auth/logout')),
    onSettled: () => {
      // Update the session query in place (the app is watching it), then drop the rest.
      queryClient.setQueryData(meKey, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meKey[0] });
    },
  });
}

/** Full-page navigation: the OAuth flow leaves the app and comes back via a redirect. */
export const LOGIN_URL = '/api/v1/auth/discogs/start';
