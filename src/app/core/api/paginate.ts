import { Observable, map } from 'rxjs';

/**
 * Laravel pagination envelope (matches the contract documented in
 * `dev-manager-backend/docs/kanban-api.md` §2.2 / Appendix B).
 */
export interface Paginated<T> {
  readonly data: readonly T[];
  readonly links: {
    readonly first: string;
    readonly last: string;
    readonly prev: string | null;
    readonly next: string | null;
  };
  readonly meta: {
    readonly current_page: number;
    readonly from: number;
    readonly last_page: number;
    readonly per_page: number;
    readonly to: number;
    readonly total: number;
    readonly path: string;
  };
}

/**
 * Convert an `Observable<unknown>` carrying the Laravel envelope into a typed
 * `Observable<Paginated<T>>`. The helper does not issue follow-up page
 * fetches; the caller decides how to walk `links.next`.
 */
export function paginate<T>(
  source$: Observable<unknown>,
): Observable<Paginated<T>> {
  return source$.pipe(
    map((raw) => paginateOnce<T>(raw)),
  );
}

/**
 * Pure value-level variant. Useful in tests and for non-Observable callers.
 */
export function paginateOnce<T>(raw: unknown): Paginated<T> {
  if (!raw || typeof raw !== 'object') {
    throw new Error('paginate: expected an envelope object');
  }
  const envelope = raw as {
    data?: unknown;
    links?: unknown;
    meta?: unknown;
  };
  if (!Array.isArray(envelope.data)) {
    throw new Error('paginate: envelope.data must be an array');
  }
  return {
    data: envelope.data as readonly T[],
    links: readLinks(envelope.links),
    meta: readMeta(envelope.meta),
  };
}

function readLinks(raw: unknown): Paginated<unknown>['links'] {
  const fallback: Paginated<unknown>['links'] = {
    first: '',
    last: '',
    prev: null,
    next: null,
  };
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const obj = raw as Record<string, unknown>;
  return {
    first: stringOr(obj['first'], ''),
    last: stringOr(obj['last'], ''),
    prev: stringOrNull(obj['prev']),
    next: stringOrNull(obj['next']),
  };
}

function readMeta(raw: unknown): Paginated<unknown>['meta'] {
  const fallback: Paginated<unknown>['meta'] = {
    current_page: 1,
    from: 0,
    last_page: 1,
    per_page: 25,
    to: 0,
    total: 0,
    path: '',
  };
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const obj = raw as Record<string, unknown>;
  return {
    current_page: numberOr(obj['current_page'], 1),
    from: numberOr(obj['from'], 0),
    last_page: numberOr(obj['last_page'], 1),
    per_page: numberOr(obj['per_page'], 25),
    to: numberOr(obj['to'], 0),
    total: numberOr(obj['total'], 0),
    path: stringOr(obj['path'], ''),
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
