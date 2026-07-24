/**
 * Barrel re-export for the kanban resource models. Consumers import from
 * `@modules/kanban/models` rather than reaching into individual files.
 *
 * NOTE: `Project` is sourced from `core/projects/project.model` because the
 * upstream is the single source of truth (PR1 already established that). The
 * kanban module should not duplicate the shape.
 */

import type { Board } from './board.model';
import type { KanbanColumn } from './column.model';
import type { KanbanCard } from './card.model';
import type { KanbanLabel } from './label.model';
import { LABEL_PALETTE } from './label.model';

export type { Board, BoardAuditLog, BulkOperationItem, BulkOperationResult } from './board.model';
export type { KanbanColumn } from './column.model';
export type { KanbanCard } from './card.model';
export type { KanbanComment } from './comment.model';
export type { KanbanAttachment } from './attachment.model';
export type { KanbanLabel } from './label.model';
export { LABEL_PALETTE } from './label.model';
export type { Paginated, Page, PageMeta, PageLinks } from './pagination.model';
export type { Project } from '../../../core/projects/project.model';
export type { Task, TaskPatch, TaskPriority, TaskStatus, TaskSummary } from './task.model';

/**
 * `BoardDetail` is the payload the read-only detail page renders in a single
 * fetch round-trip (spec `kanban-read` F3). It groups the board, its columns,
 * and its cards so the page does not have to fan out multiple subscribes per
 * column. The backend show endpoint (`/boards/{board}`) returns the bare
 * Board per `kanban-api.md` §5.3 — `KanbanApi.getBoard()` composes the
 * one-trip payload client-side by joining board + columns + cards per column.
 *
 * If the backend later adds a nested includes endpoint, only the API layer
 * needs to change: this type is the stable consumer contract.
 */
export interface BoardDetail {
  readonly board: Board;
  readonly columns: readonly KanbanColumn[];
  readonly cardsByColumnId: Readonly<Record<string, readonly KanbanCard[]>>;
}
