/**
 * Wrapper around the Laravel pagination envelope typed against the kanban
 * resource shapes. Re-exports {@link Paginated} from
 * `core/api/paginate` so kanban callers don't have to reach across the layers.
 */
import type { Paginated } from '../../../core/api/paginate';

export type { Paginated };

/**
 * Slim aliases for page metadata + links (used when callers want to render the
 * meta block in the UI without rebuilding the full envelope).
 */
export interface PageMeta {
  readonly current_page: number;
  readonly last_page: number;
  readonly per_page: number;
  readonly total: number;
}

export interface PageLinks {
  readonly first: string;
  readonly last: string;
  readonly prev: string | null;
  readonly next: string | null;
}

/**
 * Convenience type: a paginated page of kanban resources, parameterized on
 * the inner row type. Aligned with `Paginated<T>` from
 * `core/api/paginate` — the two are interchangeable.
 */
export type Page<T> = Paginated<T>;
