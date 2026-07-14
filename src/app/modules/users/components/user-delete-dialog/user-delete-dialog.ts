import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface UserDeleteDialogData {
  readonly userName: string;
  readonly userEmail: string;
}

export type UserDeleteDialogResult = 'confirm' | 'cancel';

/**
 * Confirmation dialog for soft-deleting a user. Returns 'confirm' only
 * when the admin explicitly confirms. The dialog title and message
 * include the user email so accidental clicks are recoverable.
 */
@Component({
  selector: 'app-user-delete-dialog',
  imports: [MatButtonModule, MatDialogActions, MatDialogContent, MatDialogTitle],
  template: `
    <h2 mat-dialog-title id="user-delete-dialog-title">Delete user {{ data.userEmail }}?</h2>
    <mat-dialog-content id="user-delete-dialog-content">
      <p>
        Soft-deleting <strong>{{ data.userName }}</strong> ({{ data.userEmail }}) revokes every
        active session this user has. The record can be recovered through the database in the
        future, but they will not be able to log in again.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="onCancel()" data-testid="user-delete-cancel">
        Cancel
      </button>
      <button
        mat-flat-button
        color="warn"
        type="button"
        (click)="onConfirm()"
        data-testid="user-delete-confirm"
      >
        Delete user
      </button>
    </mat-dialog-actions>
  `,
})
export class UserDeleteDialog {
  private readonly ref = inject(MatDialogRef<UserDeleteDialog, UserDeleteDialogResult>);
  protected readonly data = inject<UserDeleteDialogData>(MAT_DIALOG_DATA);

  onConfirm(): void {
    this.ref.close('confirm');
  }

  onCancel(): void {
    this.ref.close('cancel');
  }
}
