import { AxiosError } from 'axios';

interface ApiErrorData {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

/**
 * Extract a human-readable error message from an Axios error (or any unknown).
 *
 * Handles the NestJS `ErrorResponseDto` shape where `message` can be either
 * a single string or an array of validation messages.
 *
 * @param err   – The caught error (typically an AxiosError)
 * @param fallback – Fallback text when no useful message can be extracted
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AxiosError && err.response?.data) {
    const data = err.response.data as ApiErrorData;
    const msg = data.message;

    if (Array.isArray(msg) && msg.length > 0) {
      // Validation errors — join multiple messages
      return msg.join('. ');
    }
    if (typeof msg === 'string' && msg.length > 0) {
      return msg;
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallback;
}
