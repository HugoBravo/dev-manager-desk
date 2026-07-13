import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import type { Project } from '../../../../core/projects/project.model';

/**
 * Payload emitted by every {@link ProjectCardMenu} output. Carries the
 * project id AND the trigger button element so the page can pass the
 * trigger to the dialog (for focus return on close) and to the snackbar
 * handler (for focus return after the action completes).
 */
export interface ProjectCardMenuEvent {
  readonly id: number;
  readonly trigger: HTMLElement;
}

/**
 * Per-project overflow action menu. Renders a `more_vert` icon button
 * that opens a Material menu with Edit, Archive / Unarchive, and Delete
 * actions.
 *
 * Inputs are signals (Angular v22 idiomatic); outputs emit
 * {@link ProjectCardMenuEvent} payloads so the page can drive the
 * dialog + focus flow without re-deriving either piece.
 *
 * Accessibility:
 * - `aria-haspopup="menu"` on the trigger button.
 * - `aria-label` dynamic per project name so screen readers announce
 *   which card the menu controls.
 * - Material handles focus management and Escape close by default.
 */
@Component({
  selector: 'app-project-card-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './project-card-menu.html',
  host: {
    '[class.app-project-card-menu]': 'true',
  },
})
export class ProjectCardMenu {
  readonly project = input.required<Project>();
  readonly mode = input<'active' | 'archived'>('active');

  readonly edit = output<ProjectCardMenuEvent>();
  readonly archive = output<ProjectCardMenuEvent>();
  readonly unarchive = output<ProjectCardMenuEvent>();
  readonly delete = output<ProjectCardMenuEvent>();

  protected readonly triggerLabel = (): string =>
    `Project actions for ${this.project().name}`;

  protected readonly archiveLabel = (): string =>
    this.mode() === 'archived' ? 'Unarchive' : 'Archive';

  /**
   * Each menu item handler takes the originating `<button mat-menu-item>`
   * element via `$event.currentTarget` from the template. Using
   * `currentTarget` (not `target`) gives us the button the listener is
   * attached to, which is always the menu item — independent of any
   * nested icon or span the user clicked.
   */
  protected onEdit(trigger: HTMLElement): void {
    this.edit.emit({ id: this.project().id, trigger });
  }

  protected onArchiveToggle(trigger: HTMLElement): void {
    const event: ProjectCardMenuEvent = {
      id: this.project().id,
      trigger,
    };
    if (this.mode() === 'archived') {
      this.unarchive.emit(event);
    } else {
      this.archive.emit(event);
    }
  }

  protected onDelete(trigger: HTMLElement): void {
    this.delete.emit({ id: this.project().id, trigger });
  }
}
