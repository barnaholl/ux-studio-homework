import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

function isAxios(err: unknown): err is AxiosError {
  return typeof err === 'object' && err !== null && 'isAxiosError' in err;
}

function friendlyMessage(error: unknown): string {
  if (isAxios(error)) {
    const status = error.response?.status;
    if (status === 429) return 'Too many requests — please slow down';
    if (status && status >= 500) return 'Server error — please try again later';
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (!error.response) return 'Network error — check your connection';
  }
  return 'Something went wrong';
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (import.meta.env.DEV) {
        console.error('[QueryCache]', error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (import.meta.env.DEV) {
        console.error('[MutationCache]', error);
      }
      // Only show global toast if the mutation didn't set its own onError
      if (!mutation.options.onError) {
        const { addToast } = getToastRef();
        addToast?.(friendlyMessage(error), { type: 'error' });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Lightweight reference so the MutationCache can show toasts without React context
let _toastRef: { addToast?: (msg: string, opts?: { type?: 'error' | 'success' | 'info' }) => void } = {};
export function setToastRef(ref: typeof _toastRef) { _toastRef = ref; }
function getToastRef() { return _toastRef; }
