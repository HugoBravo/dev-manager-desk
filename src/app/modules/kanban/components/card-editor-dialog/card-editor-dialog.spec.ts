import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { API_CONFIG } from '../../../../core/config/api-config';
import type { KanbanCard, KanbanLabel } from '../../models';
import { KanbanApi } from '../../api/kanban.api';
import { KanbanWriteApi } from '../../api/kanban-write.api';
import { BoardsStore } from '../../stores/boards.store';
import { LabelsStore } from '../../stores/labels.store';
import {
  CardEditorDialog,
  type CardEditorDialogData,
  type CardEditorDialogResult,
} from './card-editor-dialog';
import { CardLabelsPicker } from '../card-labels-picker/card-labels-picker';
import { LabelChip } from '../label-chip/label-chip';

const API_BASE_URL = 'http://localhost:8000/api';

function sampleCard(overrides: Partial<KanbanCard> = {}): KanbanCard {
  return {
    id: 87,
    column_id: 12,
    title: 'Implement login form',
    body: 'A long-enough body to be visible.',
    due_date: null,
    archived_at: null,
    position: 'k',
    labels: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface MountResult {
  fixture: ComponentFixture<CardEditorDialog>;
  closeSpy: ReturnType<typeof vi.fn>;
  httpMock: HttpTestingController;
  labelsStore: LabelsStore;
}

function mountDialog(data: CardEditorDialogData): MountResult {
  TestBed.resetTestingModule();
  const closeSpy = vi.fn();
  TestBed.configureTestingModule({
    imports: [
      CardEditorDialog,
      CardLabelsPicker,
      LabelChip,
      MatDialogModule,
      MatSnackBarModule,
      NoopAnimationsModule,
    ],
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
        provide: MatDialogRef<CardEditorDialog, CardEditorDialogResult>,
        useValue: { close: closeSpy, afterClosed: () => Promise.resolve(undefined) },
      },
    ],
  });
  // IMPORTANT: mark the LabelsStore cache as "attempted" BEFORE
  // createComponent() so the dialog's constructor (which fires
  // ensureLoaded()) sees the short-circuit flag. We can't instantiate it
  // because the LabelsStore has no public constructor — it uses
  // field-level `inject()` calls. The factory below mounts a partial stub
  // that wraps the real store and pre-seeds the cache; createComponent
  // gets the same instance.
  const realStore = TestBed.inject(LabelsStore);
  realStore.__markLoadedForTests();
  realStore.labelsCache.set([]);

  const fixture = TestBed.createComponent(CardEditorDialog);
  fixture.detectChanges();
  return {
    fixture,
    closeSpy,
    httpMock: TestBed.inject(HttpTestingController),
    labelsStore: realStore,
  };
}

describe('CardEditorDialog', () => {
  it('does NOT render the picker in create mode and shows the hint copy', () => {
    const { fixture } = mountDialog({
      mode: 'create',
      projectId: 7,
      boardId: 4,
      columnId: 12,
    });
    const httpMock = TestBed.inject(HttpTestingController);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('app-card-labels-picker')).toBeNull();
    const hint = host.querySelector('.labels-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('You can add labels to this card after creating it.');
    expect(fixture.debugElement.query(By.directive(CardLabelsPicker))).toBeNull();
    httpMock.verify();
  });

  it('renders the picker in edit mode and the chip for a card label is toggled', () => {
    const bug: KanbanLabel = {
      id: 4,
      name: 'bug',
      color: '#ef4444',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const p1: KanbanLabel = {
      id: 7,
      name: 'p1',
      color: '#f59e0b',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const { fixture, labelsStore } = mountDialog({
      mode: 'edit',
      projectId: 7,
      boardId: 4,
      columnId: 12,
      card: sampleCard({ labels: [bug] }),
    });
    // Seed the label library AFTER mounting so the picker renders both
    // chips. ensureLoaded() was a no-op because the cache was marked
    // attempted before mounting.
    labelsStore.labelsCache.set([bug, p1]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('app-card-labels-picker')).not.toBeNull();
    const chipEls = host.querySelectorAll('app-label-chip');
    expect(chipEls.length).toBe(2);
    expect(fixture.debugElement.query(By.directive(CardLabelsPicker))).not.toBeNull();

    // CardLabelsPicker sets [interactive]="true" and binds [toggled]="hasLabel(label.id)".
    // LabelChip renders [attr.aria-pressed]="ariaPressed()" → "true"/"false".
    const chipButtons = host.querySelectorAll('app-label-chip button');
    expect(chipButtons.length).toBe(2);
    const pressedStates = Array.from(chipButtons).map((b) =>
      (b as HTMLButtonElement).getAttribute('aria-pressed'),
    );
    expect(pressedStates).toContain('true');
    expect(pressedStates).toContain('false');
    expect(pressedStates.filter((s) => s === 'true').length).toBe(1);
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.verify();
  });

  it('LabelChip instances inside the picker receive their [toggled] input from hasLabel', () => {
    const bug: KanbanLabel = {
      id: 4,
      name: 'bug',
      color: '#ef4444',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const p1: KanbanLabel = {
      id: 7,
      name: 'p1',
      color: '#f59e0b',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const { fixture, labelsStore } = mountDialog({
      mode: 'edit',
      projectId: 7,
      boardId: 4,
      columnId: 12,
      card: sampleCard({ labels: [bug] }),
    });
    labelsStore.labelsCache.set([bug, p1]);
    fixture.detectChanges();

    const chipDebugs = fixture.debugElement.queryAll(By.directive(LabelChip));
    expect(chipDebugs.length).toBe(2);
    // Read the [toggled] input off the chip componentRef instance.
    // LabelChip defines `toggled = input<boolean>(false)`.
    const toggledStates: boolean[] = chipDebugs.map((d) => {
      const instance = d.componentInstance as { toggled: () => boolean };
      return instance.toggled();
    });
    expect(toggledStates.filter((b) => b).length).toBe(1);
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.verify();
  });

  it('commits the picker-emitted card to BoardsStore via applyCardMutation', async () => {
    const bug: KanbanLabel = {
      id: 4,
      name: 'bug',
      color: '#ef4444',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const p1: KanbanLabel = {
      id: 7,
      name: 'p1',
      color: '#f59e0b',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const { fixture, labelsStore, httpMock } = mountDialog({
      mode: 'edit',
      projectId: 7,
      boardId: 4,
      columnId: 12,
      card: sampleCard({ labels: [bug] }),
    });
    labelsStore.labelsCache.set([bug, p1]);
    const store = TestBed.inject(BoardsStore);
    const applySpy = vi.spyOn(store, 'applyCardMutation');
    fixture.detectChanges();

    // Reach into the picker component and emit the canonical card the
    // server would return after a successful labels sync.
    const pickerDebug = fixture.debugElement.query(By.directive(CardLabelsPicker));
    const pickerInstance = pickerDebug.componentInstance as unknown as {
      changed: { emit: (card: KanbanCard) => void };
    };
    const updatedCard: KanbanCard = sampleCard({ labels: [bug, p1] });
    pickerInstance.changed.emit(updatedCard);

    expect(applySpy).toHaveBeenCalledWith(updatedCard);
    httpMock.verify();
  });
});
