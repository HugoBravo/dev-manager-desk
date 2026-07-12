import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { ProjectService } from '../../../../core/projects/project.service';
import { ErrorNormalizer } from '../../../../core/errors/error-normalizer';
import type { ApiError } from '../../../../core/errors/api-error';
import {
  ProjectEditorDialog,
  type ProjectEditorDialogData,
  type ProjectEditorDialogResult,
} from '../../components/project-editor-dialog/project-editor-dialog';

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
    MatIconModule,
    MatProgressSpinnerModule,
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
  protected readonly isSubmitting = signal(false);

  protected readonly isBusy = computed(() => this.isSubmitting());

  protected readonly statusMessage = computed(() => {
    const err = this.bootstrapError();
    if (err) {
      return ErrorNormalizer.toUserMessage(err);
    }
    return '';
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
}