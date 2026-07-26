import appConfig from '@/config/appConfig';
import type { AuthSession } from '@/core/models';
import { loadSession } from '@/auth/secureSession';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true
) {
  const session = authenticated ? await loadSession() : null;
  const response = await fetch(`${appConfig.api.baseUrl}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      ...options.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | T
    | {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
      }
    | null;
  if (!response.ok) {
    const error = payload as {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
    } | null;
    throw new ApiError(
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The request could not be completed.',
      error?.details
    );
  }
  return payload as T;
}

export const authApi = {
  signup: (input: { name: string; email: string; password: string }) =>
    apiRequest<{ email: string; expiresAt: string }>(
      '/auth/signup',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      false
    ),
  resend: (email: string) =>
    apiRequest<{ email: string; expiresAt: string }>(
      '/auth/resend-verification',
      { method: 'POST', body: JSON.stringify({ email }) },
      false
    ),
  verifyEmail: (email: string, code: string) =>
    apiRequest<AuthSession>(
      '/auth/verify-email',
      {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      },
      false
    ),
  login: (email: string, password: string) =>
    apiRequest<AuthSession>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false
    ),
  restore: (email: string, password: string) =>
    apiRequest<AuthSession>(
      '/auth/restore-account',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      false
    ),
};

export async function apiReachable() {
  try {
    const response = await fetch(`${appConfig.api.baseUrl}/health`, {
      headers: { accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}
