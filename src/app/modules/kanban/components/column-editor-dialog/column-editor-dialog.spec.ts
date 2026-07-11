import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import { KanbanApi } from '../../api/kanban.api';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import { LabelsStore } from '../../stores/labels.store';
import {
  ColumnEditorDialog,
  type ColumnEditorDialogData,
  type ColumnEditorDialogResult,
} from './column-editor-dialog';

const API_BASE_URL = 'http://localhost:8000/api';

interface MountResult {
  fixture: ComponentFixture<ColumnEditorDialog>;
  closeSpy: ReturnType<typeof vi.fn>;
}

function mountDialog(data: ColumnEditorDialogData): MountResult {
  TestBed.resetTestingModule();
  const closeSpy = vi.fn();
  TestBed.configureTestingModule({
    imports: [ColumnEditorDialog, MatDialogModule, MatSnackBarModule, NoopAnimationsModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_CONFIG, useValue: { apiBaseUrl: API_BASE_URL } },
      KanbanApi,
      KanbanWriteApi,
      BoardsStore,
      LabelsStore,
      { provide: MAT_DIALOG_DATA, useValue: data },
      {
        provide: MatDialogRef<ColumnEditorDialog, ColumnEditorDialogResult>,
        useValue: { close: closeSpy, afterClosed: () => Promise.resolve(undefined) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ColumnEditorDialog);
  fixture.detectChanges();
  return { fixture, closeSpy };
}

describe('ColumnEditorDialog', () => {
  it('renders the "New column" title in create mode', () => {
    const { fixture } = mountDialog({ mode: 'create' });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#column-editor-title')?.textContent).toContain('New column');
  });

  it('renders the "Rename column" title in rename mode', () => {
    const { fixture } = mountDialog({ mode: 'rename', initialName: 'Old name' });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#column-editor-title')?.textContent).toContain('Rename column');
  });

  it('prefills the input with initialName in rename mode', () => {
    const { fixture } = mountDialog({ mode: 'rename', initialName: 'Old name' });
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input?.value).toBe('Old name');
  });

  it('closes with `{ action: "saved", name: trimmed }` on submit', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create' });
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    input.value = '  Backlog  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const form = host.querySelector<HTMLFormElement>('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    // The submit path goes through `submit(form, action)` which is async.
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith({ action: 'saved', name: 'Backlog' });
  });

  it('does NOT close when the trimmed name is empty', async () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create' });
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    // Even an explicit "submit" event on the form must not close the
    // dialog when the trimmed value is empty. The submit handler
    // explicit-cases the trim-empty branch and returns without closing.
    input.value = '     ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const form = host.querySelector<HTMLFormElement>('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('Cancel button closes with `{ action: "cancel" }`', () => {
    const { fixture, closeSpy } = mountDialog({ mode: 'create' });
    const host = fixture.nativeElement as HTMLElement;
    const cancel = host.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!;
    cancel.click();
    expect(closeSpy).toHaveBeenCalledWith({ action: 'cancel' });
  });
});
