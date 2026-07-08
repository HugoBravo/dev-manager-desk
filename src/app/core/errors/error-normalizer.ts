import { HttpErrorResponse } from '@angular/common/http';

import type { ApiError } from './api-error';
import { ERROR_MESSAGES } from './error-messages';

/**
 * Options accepted by {@link ErrorNormalizer.normalize}. `url` enables the
 * comment 403 special-case (see F4 in the spec).
 */
export interface NormalizeContext {
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Pure normalizer. No I/O, no side effects, no logging. Safe to call from
 * inside `catchError` per request, in tests, and from store code.
 *
 * ## PR2+ wiring contract (non-negotiable)
 *
 * The 403 `edit_window_expired` discriminator (F4) ONLY activates when the
 * caller passes URL + response headers into {@link NormalizeContext}. With
 * a status + body pair alone, the URL heuristic gets nothing to inspect.
 *
 * Every PR2+ HTTP client (e.g. `KanbanApi`) MUST pipe `HttpErrorResponse`
 * through `ErrorNormalizer.fromHttpErrorResponse(err)` (or
 * `ErrorNormalizer.normalize(err)`) inside its `.pipe(catchError(...))`
 * chain. A status+body pair alone is fine for typed 409 / 422 / 401 / 404
 * cases; for 403, the caller must include the URL. The X-Kanban-Realm
 * response header is forward-compat — if the backend ever sends it, callers
 * SHOULD also forward response headers via `ctx.headers`.
 *
 * Callers that build errors from `fetch` or non-`HttpClient` paths should
 * construct an `HttpErrorResponse` (or pass `{ url, headers }`) so this
 * discriminator still fires.
 */
export const ErrorNormalizer = {
  /**
   * Convert an `HttpErrorResponse` (or a status + body pair) into a typed
   * {@link ApiError}.
   */
  normalize(
    errorOrStatus: HttpErrorResponse | number,
    body?: unknown,
    context: NormalizeContext = {},
  ): ApiError {
    if (typeof errorOrStatus === 'number') {
      return ErrorNormalizer.fromStatusAndBody(errorOrStatus, body, context);
    }
    return ErrorNormalizer.fromHttpErrorResponse(errorOrStatus, context);
  },

  fromHttpErrorResponse(
    error: HttpErrorResponse,
    context: NormalizeContext = {},
  ): ApiError {
    return ErrorNormalizer.fromStatusAndBody(
      error.status,
      error.error,
      {
        url: error.url ?? context.url,
        headers: context.headers,
      },
    );
  },

  fromStatusAndBody(
    status: number,
    body: unknown,
    context: NormalizeContext = {},
  ): ApiError {
    const envelope = readEnvelope(body);
    const message = envelope.message?.trim() ? envelope.message : undefined;

    if (status === 0) {
      return {
        kind: 'network',
        status: 0,
        message: message ?? ERROR_MESSAGES.network,
      };
    }

    if (status === 401) {
      return {
        kind: 'unauthorized',
        status: 401,
        message: message ?? 'Unauthenticated.',
      };
    }

    if (status === 403) {
      return ErrorNormalizer.mapForbidden(context, message);
    }

    if (status === 404) {
      // Existence-leak prevention: any 404 — missing, archived, or
      // cross-owner — collapses to a single notFound variant. The original
      // message is discarded to avoid leaking ownership details; the UI
      // renders a single locked message via toUserMessage().
      return {
        kind: 'notFound',
        status: 404,
        message: ERROR_MESSAGES.notFound,
      };
    }

    if (status === 409) {
      const code = envelope.code;
      if (code === 'board_has_contents' || code === 'column_has_contents') {
        return {
          kind: 'conflict',
          status: 409,
          code,
          message: message ?? ERROR_MESSAGES.conflictGeneric,
        };
      }
      // Untyped 409: NO `code` field set. The UI must fall back to a
      // generic conflict message via toUserMessage() — leaking a typed
      // code (e.g. 'board_has_contents') here would mislead users into
      // thinking they need to "move columns first" for an arbitrary 409.
      return {
        kind: 'conflict',
        status: 409,
        message: message ?? ERROR_MESSAGES.conflictGeneric,
      };
    }

    if (status === 422) {
      return {
        kind: 'validation',
        status: 422,
        message: message ?? ERROR_MESSAGES.validation,
        fieldErrors: envelope.errors ?? {},
        ...(envelope.code === 'position_exhausted' ||
        envelope.code === 'attachment_mime_blocked'
          ? { code: envelope.code }
          : {}),
      };
    }

    if (status === 429) {
      return {
        kind: 'http',
        status: 429,
        message: message ?? ERROR_MESSAGES.rateLimited,
      };
    }

    if (status >= 500) {
      return {
        kind: 'http',
        status,
        message: message ?? ERROR_MESSAGES.serverError,
      };
    }

    return {
      kind: 'http',
      status,
      message: message ?? ERROR_MESSAGES.httpGeneric(status),
    };
  },

  /**
   * 403 special-case: a PATCH/DELETE on `/comments/{id}` from the
   * 15-minute edit window is the only documented 403 in the kanban API.
   * Detection is the request URL pathname; the `X-Kanban-Realm: comment`
   * response header is recognized as a forward-compatible override when
   * present.
   */
  mapForbidden(context: NormalizeContext, message: string | undefined): ApiError {
    const realmHeader = readHeaderCaseInsensitive(
      context.headers,
      'x-kanban-realm',
    )?.toLowerCase();
    const urlIsComment = isCommentMutation(context.url);
    const isEditWindow =
      realmHeader === 'comment' || urlIsComment;

    if (isEditWindow) {
      return {
        kind: 'forbidden',
        status: 403,
        code: 'edit_window_expired',
        message: message ?? ERROR_MESSAGES.editWindowExpired,
      };
    }

    return {
      kind: 'forbidden',
      status: 403,
      message: message ?? ERROR_MESSAGES.forbidden,
    };
  },

  /**
   * Map a typed {@link ApiError} to a user-facing string. The mapper is a
   * pure function — no I/O, no caching. The `notFound` branch returns the
   * same constant regardless of original cause (see existence-leak
   * prevention).
   */
  toUserMessage(error: ApiError): string {
    switch (error.kind) {
      case 'network':
        return ERROR_MESSAGES.network;
      case 'unauthorized':
        return ERROR_MESSAGES.unauthorized;
      case 'forbidden':
        if (error.code === 'edit_window_expired') {
          return ERROR_MESSAGES.editWindowExpired;
        }
        return ERROR_MESSAGES.forbidden;
      case 'notFound':
        // ONE string. No context. No branching. The contract.
        return ERROR_MESSAGES.notFound;
      case 'validation':
        if (error.code === 'position_exhausted') {
          return ERROR_MESSAGES.positionExhausted;
        }
        if (error.code === 'attachment_mime_blocked') {
          return ERROR_MESSAGES.attachmentMimeBlocked;
        }
        return joinFieldErrors(error.fieldErrors) ?? ERROR_MESSAGES.validation;
      case 'conflict':
        if (error.code === 'board_has_contents') {
          return ERROR_MESSAGES.conflictBoardHasContents;
        }
        if (error.code === 'column_has_contents') {
          return ERROR_MESSAGES.conflictColumnHasContents;
        }
        return ERROR_MESSAGES.conflictGeneric;
      case 'http':
        if (error.status === 429) {
          return ERROR_MESSAGES.rateLimited;
        }
        if (error.status >= 500) {
          return ERROR_MESSAGES.serverError;
        }
        return ERROR_MESSAGES.httpGeneric(error.status);
    }
  },
} as const;

interface Envelope {
  readonly message?: string;
  readonly code?: string;
  readonly errors?: Readonly<Record<string, readonly string[]>>;
}

function readEnvelope(body: unknown): Envelope {
  if (!body || typeof body !== 'object') {
    return {};
  }
  const obj = body as Record<string, unknown>;
  const message = typeof obj['message'] === 'string' ? obj['message'] : undefined;
  const code = typeof obj['code'] === 'string' ? obj['code'] : undefined;
  const errorsRaw = obj['errors'];
  const errors =
    errorsRaw && typeof errorsRaw === 'object' && !Array.isArray(errorsRaw)
      ? (errorsRaw as Record<string, unknown>)
      : undefined;
  const normalized = errors
    ? Object.fromEntries(
        Object.entries(errors).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [],
        ]),
      )
    : undefined;
  return {
    message,
    code,
    errors: normalized as Readonly<Record<string, readonly string[]>> | undefined,
  };
}

function isCommentMutation(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  // Match `/comments/{id}` as a path segment. The kanban API nests
  // comments under cards, so the full path looks like
  // `/api/v1/projects/.../cards/{id}/comments/{id}`. We just need the
  // last segment to be `comments/{numeric}`.
  try {
    const parsed = new URL(url, 'http://placeholder');
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      return false;
    }
    const last = segments[segments.length - 1];
    const prev = segments[segments.length - 2];
    return prev === 'comments' && /^\d+$/.test(last ?? '');
  } catch {
    return false;
  }
}

function readHeaderCaseInsensitive(
  headers: Readonly<Record<string, string>> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      return headers[key];
    }
  }
  return undefined;
}

function joinFieldErrors(
  errors: Readonly<Record<string, readonly string[]>>,
): string | null {
  const entries = Object.entries(errors);
  if (entries.length === 0) {
    return null;
  }
  const firstEntry = entries[0];
  if (!firstEntry) {
    return null;
  }
  const [field, list] = firstEntry;
  if (!list || list.length === 0) {
    return null;
  }
  return ERROR_MESSAGES.validationField(field, list[0] ?? '');
}
