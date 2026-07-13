import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { ProjectService } from '../../../../core/projects/project.service';
import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import type { Project } from '../../../../core/projects/project.model';
import {
  ProjectEditorDialog,
  type ProjectEditorDialogData,
  type ProjectEditorDialogResult,
} from '../../components/project-editor-dialog/project-editor-dialog';
import {
  ConfirmDialog,
  type ConfirmDialogData,
  type ConfirmDialogResult,
} from '../../components/confirm-dialog/confirm-dialog';
import { ProjectCardMenu, type ProjectCardMenuEvent } from '../../components/project-card-menu/project-card-menu';

/**
 * Top-level projects index page. Lists the authenticated user's projects
 * (read from `ProjectService`) and exposes the create-project entry
 * point that was missing from the app until now.
 *
 * Renders a 4-state shell — loading / error / empty / list — that
 * mirrors the kanban boards-list page so the UX is consistent across
 * features:
 *
 * - **loading**: `mat-progress-spinner` + `role="status"`. Shown while
 *   `ProjectService.isBootstrapped() === false`.
 * - **error**: error card with the normalized user message. Shown when
 *   `bootstrapError()` is non-null.
 * - **empty**: centered Material card with "Create your first project"
 *   CTA (`data-testid="empty-state-create-project"`). Shown when the
 *   bootstrapped project list is empty.
 * - **list**: header with "Create project" CTA (`data-testid="create-project-button"`)
 *   plus project cards showing `name` and (when non-null) `description`.
 *
 * Actions:
 * - Clicking either CTA opens `ProjectEditorDialog` with
 *   `mode: 'create'` and the trigger element (for focus return).
 * - On `{ action: 'saved', project }`: calls
 *   `ProjectService.create({ name, description })`, shows a snackbar
 *   with the new project name, and navigates to
 *   `/modules/kanban/projects/{id}/boards`.
 * - On `{ action: 'cancel' }`: no HTTP, no navigation, no mutation.
 *
 * Double-submit guard: a local `isSubmitting` signal flips to `true`
 * while the create HTTP is in flight. Both CTAs (and the dialog save
 * button) become disabled during that window.
 */
@Component({
  selector: 'app-projects-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    ProjectCardMenu,
  ],
  templateUrl: './projects-page.html',
  host: {
    '[attr.aria-busy]': 'isBusy()',
    '[attr.aria-live]': '"polite"',
  },
})
export class ProjectsPage {
  private readonly projectsService = inject(ProjectService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly projects = this.projectsService.projects;
  protected readonly isBootstrapped = this.projectsService.isBootstrapped;
  protected readonly bootstrapError = this.projectsService.bootstrapError;
  protected readonly includeArchived = this.projectsService.includeArchived;
  protected readonly isSubmitting = signal(false);

  /**
   * In-flight card ids. A `Set` keeps insertion order irrelevant for the
   * small N we have here and lets the menu disable ONLY the in-flight
   * card while siblings stay interactive.
   */
  protected readonly submittingIds = signal<ReadonlySet<number>>(new Set());

  protected readonly isBusy = computed(() => this.isSubmitting());

  protected readonly statusMessage = computed(() => {
    const err = this.bootstrapError();
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return '';
  });

  /**
   * Apply the visibility rule from REQ-5: archived projects show only
   * when the toggle is on. Server already filtered the default list, so
   * this computed is mainly relevant for the toggled view where archived
   * rows coexist with active ones.
   */
  protected readonly visibleProjects = computed<readonly Project[]>(() => {
    if (this.includeArchived()) {
      return this.projects();
    }
    return this.projects().filter((p) => p.archived_at === null);
  });

  /**
   * Open the project editor dialog in `create` mode. Wired from BOTH
   * the empty-state card and the header CTA. Passes the trigger element
   * so the dialog can restore focus to it on close (WCAG AA focus
   * management — the dialog itself owns focus return via
   * `afterClosed`).
   *
   * Guarded by `isSubmitting`: while a create request is in flight, the
   * CTAs are disabled so a second click does not spawn a second POST.
   */
  protected openCreateProjectDialog(triggerElement: HTMLElement): void {
    if (this.isSubmitting()) {
      return;
    }
    const data: ProjectEditorDialogData = {
      mode: 'create',
      triggerElement,
    };
    const ref = this.dialog.open<
      ProjectEditorDialog,
      ProjectEditorDialogData,
      ProjectEditorDialogResult
    >(ProjectEditorDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action !== 'saved' || !result.project) {
        return;
      }
      void this.handleSaved(result.project);
    });
  }

  /**
   * Run the HTTP create, surface the result. On success the new project
   * is added to `ProjectService.projects` and made active (via
   * `ProjectService.create`); we then snackbar and navigate. On error we
   * snackbar the normalized message and stay put so the user can retry.
   */
  private async handleSaved(payload: {
    name: string;
    description: string | null;
  }): Promise<void> {
    this.isSubmitting.set(true);
    try {
      const created = await this.projectsService.create({
        name: payload.name,
        description: payload.description,
      });
      this.snackBar.open(`Project "${created.name}" created`, 'Dismiss', {
        duration: 2500,
      });
      void this.router.navigate(['/modules/kanban/projects', created.id, 'boards']);
    } catch (err) {
      const apiError = (err && typeof err === 'object' ? (err as ApiError) : null);
      this.snackBar.open(
        apiError
          ? ErrorNormalizer.toUserMessage(apiError)
          : 'Could not create the project. Please try again.',
        'Dismiss',
        { duration: 4000 },
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Retry bootstrap. Wired to the error card's Retry button. */
  protected retry(): void {
    void this.projectsService.bootstrap();
  }

  /**
   * Show-archived toggle handler. Delegates to the service so the
   * bootstrap contract for the stored id is honored. The service
   * surfaces network failures via `bootstrapError()` so we snackbar the
   * normalized message instead of throwing.
   */
  protected async onToggleArchived(): Promise<void> {
    await this.projectsService.toggleArchived();
    const err = this.projectsService.bootstrapError();
    if (err) {
      this.snackBar.open(ErrorNormalizer.toUserMessage(err), 'Dismiss', {
        duration: 4000,
      });
    }
  }

  protected onEdit(event: ProjectCardMenuEvent): void {
    const { id, trigger } = event;
    const project = this.projects().find((p) => p.id === id);
    if (!project) {
      // Stale reference; the menu was probably opened against a row
      // that got removed while the dropdown was open. Nothing to edit.
      return;
    }
    const data: ProjectEditorDialogData = {
      mode: 'edit',
      initial: { name: project.name, description: project.description },
      triggerElement: trigger,
    };
    const ref = this.dialog.open<
      ProjectEditorDialog,
      ProjectEditorDialogData,
      ProjectEditorDialogResult
    >(ProjectEditorDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result || result.action !== 'saved' || !result.project) {
        return;
      }
      void this.handleEditSaved(id, result.project);
    });
  }

  private async handleEditSaved(
    id: number,
    payload: { name: string; description: string | null },
  ): Promise<void> {
    this.setSubmitting(id, true);
    try {
      const updated = await this.projectsService.update(id, {
        name: payload.name,
        description: payload.description,
      });
      this.snackBar.open(`Project "${updated.name}" updated`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      const apiError = toApiError(err);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.setSubmitting(id, false);
    }
  }

  protected onArchive(event: ProjectCardMenuEvent): void {
    const { id, trigger } = event;
    const project = this.projects().find((p) => p.id === id);
    if (!project) {
      return;
    }
    const data: ConfirmDialogData = {
      title: 'Archive project?',
      message:
        'You can restore it later from the archived list. Boards under this project stay intact.',
      mode: 'archive',
    };
    const ref = this.dialog.open<
      ConfirmDialog,
      ConfirmDialogData,
      ConfirmDialogResult
    >(ConfirmDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result?.confirmed) {
        return;
      }
      void this.handleArchiveConfirmed(project, trigger);
    });
  }

  private async handleArchiveConfirmed(
    project: Project,
    triggerElement: HTMLElement | undefined,
  ): Promise<void> {
    const id = project.id;
    const name = project.name;
    this.setSubmitting(id, true);
    try {
      await this.projectsService.archive(id);
      const snackRef = this.snackBar.open(
        `Project "${name}" archived`,
        'Undo',
        { duration: 10000 },
      );
      snackRef.onAction().subscribe(() => {
        void this.projectsService.unarchive(id);
      });
      // Move focus back to the card menu trigger so keyboard users
      // land on the still-visible card row.
      triggerElement?.focus();
    } catch (err) {
      const apiError = toApiError(err);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.setSubmitting(id, false);
    }
  }

  protected onUnarchive(event: ProjectCardMenuEvent): void {
    const project = this.projects().find((p) => p.id === event.id);
    if (!project) {
      return;
    }
    void this.handleUnarchiveConfirmed(project);
  }

  private async handleUnarchiveConfirmed(project: Project): Promise<void> {
    const id = project.id;
    const name = project.name;
    this.setSubmitting(id, true);
    try {
      await this.projectsService.unarchive(id);
      this.snackBar.open(`Project "${name}" restored`, 'Dismiss', {
        duration: 2500,
      });
    } catch (err) {
      const apiError = toApiError(err);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.setSubmitting(id, false);
    }
  }

  protected onDelete(event: ProjectCardMenuEvent): void {
    const { id, trigger } = event;
    const project = this.projects().find((p) => p.id === id);
    if (!project) {
      return;
    }
    const data: ConfirmDialogData = {
      title: 'Delete project?',
      message:
        'This permanently deletes the project and all of its boards. This cannot be undone.',
      mode: 'delete',
      projectName: project.name,
    };
    const ref = this.dialog.open<
      ConfirmDialog,
      ConfirmDialogData,
      ConfirmDialogResult
    >(ConfirmDialog, { data });
    void firstValueFrom(ref.afterClosed()).then((result) => {
      if (!result?.confirmed) {
        return;
      }
      void this.handleDeleteConfirmed(project, trigger);
    });
  }

  private async handleDeleteConfirmed(
    project: Project,
    triggerElement: HTMLElement | undefined,
  ): Promise<void> {
    const id = project.id;
    const name = project.name;
    this.setSubmitting(id, true);
    try {
      await this.projectsService.delete(id);
      this.snackBar.open(`Project "${name}" deleted`, 'Dismiss', {
        duration: 2500,
      });
      // If the deleted project was the toolbar selection, the service
      // already cleared the active signal + localStorage. Move focus
      // back to the menu trigger so keyboard users don't get stranded
      // on a now-empty page.
      triggerElement?.focus();
    } catch (err) {
      const apiError = toApiError(err);
      this.snackBar.open(ErrorNormalizer.toUserMessage(apiError), 'Dismiss', {
        duration: 4000,
      });
    } finally {
      this.setSubmitting(id, false);
    }
  }

  /** Per-card submit guard. Disables the menu trigger while in flight. */
  protected isSubmittingFor(id: number): boolean {
    return this.submittingIds().has(id);
  }

  private setSubmitting(id: number, value: boolean): void {
    this.submittingIds.update((set) => {
      const next = new Set(set);
      if (value) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}

/**
 * Narrow an unknown error into the ApiError shape the snackbar expects.
 * Mirrors the helper inside ProjectService so the page layer can render
 * a normalized message without importing the service's private utils.
 */
function toApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err) {
    return err as ApiError;
  }
  if (err && typeof err === 'object' && 'status' in err) {
    return ErrorNormalizer.fromHttpErrorResponse(err as never);
  }
  return {
    kind: 'network',
    status: 0,
    message: 'Could not reach the server. Check your connection and try again.',
  };
}