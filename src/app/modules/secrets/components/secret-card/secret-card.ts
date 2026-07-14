import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';

import type { Secret } from '../../models/secret.model';

/**
 * Per-secret list row. Owns the "reveal / conceal" lifecycle for the
 * plaintext value; never logs or persists the decrypted value beyond the
 * in-memory signal lifetime. The "Copy" action uses the
 * `navigator.clipboard.writeText` browser API which is itself short-lived
 * (the OS clipboard is a separate trust boundary the user can clear at
 * will).
 *
 * The Edit / Delete actions are rendered as direct icon buttons (no
 * `mat-menu` overlay) — this keeps them reachable in one click and
 * avoids the keyboard / focus-trap complexity of overlay menus for
 * single-action, equally-weighted controls.
 *
 * A11y:
 * - the row is a real `<article>` with an `aria-label` summarizing the
 *   secret (key + updated-at) so screen-reader users can navigate a list
 *   of secrets without entering each row.
 * - the reveal toggle is a Material `mat-icon-button` with
 *   `aria-pressed` so AT users hear the toggle state.
 * - the edit / delete actions have descriptive `aria-label`s driven by
 *   the key.
 */
@Component({
  selector: 'app-secret-card',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './secret-card.html',
  styleUrl: './secret-card.scss',
})
export class SecretCard {
  private readonly snackBar = inject(MatSnackBar);

  readonly secret = input.required<Secret>();

  readonly edit = output<void>();
  readonly remove = output<void>();

  protected readonly revealed = signal(false);
  protected readonly revealTimer = signal<number | null>(null);

  protected readonly maskedValue = '••••••••';

  protected readonly displayValue = computed(() => {
    if (!this.revealed()) {
      return this.maskedValue;
    }
    return this.secret().value;
  });

  protected readonly updatedAt = computed(() => formatDate(this.secret().updated_at));

  protected readonly ariaLabel = computed(() => {
    const s = this.secret();
    return `Secret ${s.key}, last updated ${this.updatedAt()}`;
  });

  constructor() {
    effect((onCleanup) => {
      this.revealed();
      const handle = this.revealTimer();
      onCleanup(() => {
        if (handle !== null && typeof window !== 'undefined') {
          window.clearTimeout(handle);
        }
      });
    });
  }

  protected toggleReveal(): void {
    const next = !this.revealed();
    const handle = this.revealTimer();
    if (handle !== null && typeof window !== 'undefined') {
      window.clearTimeout(handle);
      this.revealTimer.set(null);
    }
    this.revealed.set(next);
    if (next && typeof window !== 'undefined') {
      const handleId = window.setTimeout(() => {
        this.revealed.set(false);
        this.revealTimer.set(null);
      }, 15_000);
      this.revealTimer.set(handleId);
    }
  }

  protected async copyValue(): Promise<void> {
    const text = this.secret().value;
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text);
        this.snackBar.open(`Copied "${this.secret().key}" to clipboard`, 'Dismiss', {
          duration: 2000,
        });
      }
    } catch {
      this.snackBar.open('Could not copy to clipboard', 'Dismiss', {
        duration: 3000,
      });
    }
  }

  protected onEditClick(): void {
    this.edit.emit();
  }

  protected onDeleteClick(): void {
    this.remove.emit();
  }
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleString();
}
