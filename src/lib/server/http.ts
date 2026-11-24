/**
 * Shared HTTP utilities for SvelteKit `/api/*` routes: structured errors,
 * request body/query parsing, uniform JSON error responses, and reverse-proxy
 * origin resolution.
 */
import {
  isHttpError,
  json,
  type RequestEvent,
  type RequestHandler,
} from '@sveltejs/kit';
import { errorText, isObj, type Obj } from '$lib/util';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): ApiError =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const notFound = (message: string): ApiError =>
  new ApiError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown): ApiError =>
  new ApiError(409, 'CONFLICT', message, details);

export const badGateway = (message: string, details?: unknown): ApiError =>
  new ApiError(502, 'BAD_GATEWAY', message, details);

export async function parseJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
}

export async function parseJsonObject(
  request: Request,
  label = 'a JSON object',
): Promise<Obj> {
  const body = await parseJsonBody<unknown>(request);
  if (!isObj(body)) throw badRequest(`Expected ${label}.`);
  return body;
}

export function requireQueryParam(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim() ?? '';
  if (!value) throw badRequest(`Missing required query parameter "${name}".`);
  return value;
}

export function boolQueryParam(url: URL, name: string): boolean {
  const raw = url.searchParams.get(name)?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const payload: Record<string, unknown> = {
    // Top-level `message` keeps existing fetchOk / SvelteKit callers working.
    message,
    error:
      details !== undefined ? { code, message, details } : { code, message },
  };
  return json(payload, { status });
}

/**
 * Wrap a SvelteKit RequestHandler so thrown `ApiError`s and unexpected errors
 * return consistent JSON error responses without per-route try/catch blocks.
 */
export function apiHandler<E extends RequestEvent = RequestEvent>(
  fn: (event: E) => Response | Promise<Response>,
): RequestHandler {
  return async (event) => {
    try {
      return await fn(event as E);
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.status, err.code, err.message, err.details);
      }
      if (isHttpError(err)) {
        const msg =
          typeof err.body === 'object' &&
          err.body !== null &&
          'message' in err.body
            ? String((err.body as { message: unknown }).message)
            : `HTTP ${err.status}`;
        return errorResponse(err.status, `HTTP_${err.status}`, msg);
      }
      return errorResponse(500, 'INTERNAL_ERROR', errorText(err));
    }
  };
}

/**
 * Effective external origin of a request, honoring `X-Forwarded-Proto` and
 * `X-Forwarded-Host` when running behind a reverse proxy (Synology DSM, Nginx, Cloudflare).
 */
export function requestOrigin(request: Request, url: URL): string {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();
  const forwardedHost = request.headers
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  if (!forwardedProto && !forwardedHost) return url.origin;
  const proto = forwardedProto || url.protocol.replace(/:$/, '');
  const host = forwardedHost || request.headers.get('host') || url.host;
  return `${proto}://${host}`;
}
