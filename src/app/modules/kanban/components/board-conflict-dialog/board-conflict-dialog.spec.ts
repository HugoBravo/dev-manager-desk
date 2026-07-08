import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import {
  BoardConflictDialog,
  type BoardConflictDialogData,
} from './board-conflict-dialog';

function mount(data: Partial<BoardConflictDialogData> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BoardConflictDialog, NoopAnimationsModule],
    providers: [
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          entityType: 'board',
          entityName: 'Sprint 42',
          navigateTarget: [
            '/modules/kanban/projects',
            '7',
            'boards',
            '4',
          ],
          message: 'This board still has columns.',
          ...data,
        } satisfies BoardConflictDialogData,
      },
      { provide: MatDialogRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(BoardConflictDialog);
  fixture.detectChanges();
  return fixture;
}

describe('BoardConflictDialog', () => {
  it('renders the title and copy', () => {
    const fixture = mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('h2')?.textContent).toContain('Board has contents');
    expect(host.textContent).toContain('This board still has columns');
  });

  it('disables the Open button when no navigateTarget is provided', () => {
    const fixture = mount({ navigateTarget: null });
    const host = fixture.nativeElement as HTMLElement;
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    const openButton = Array.from(buttons).find((b) =>
      b.textContent?.includes('Open'),
    );
    expect(openButton?.disabled).toBe(true);
  });

  it('enables the Open button when navigateTarget is provided', () => {
    const fixture = mount();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    const openButton = Array.from(buttons).find((b) =>
      b.textContent?.includes('Open'),
    );
    expect(openButton?.disabled).toBe(false);
    expect(openButton?.textContent).toContain('Sprint 42');
  });

  it('uses the column title copy when entityType is column', () => {
    const fixture = mount({ entityType: 'column', entityName: 'In Progress' });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('h2')?.textContent).toContain(
      'Column has contents',
    );
  });
});