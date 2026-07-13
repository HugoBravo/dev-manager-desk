import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import type { Project } from '../../../../core/projects/project.model';
import { ProjectCardMenu } from './project-card-menu';

const sampleProject = (overrides: Partial<Project> = {}): Project => ({
  id: 42,
  name: 'My Project',
  slug: 'my-project',
  description: null,
  owner_id: 1,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

interface MountResult {
  fixture: ComponentFixture<ProjectCardMenu>;
  component: ProjectCardMenu;
}

async function mount(
  project: Project,
  mode: 'active' | 'archived' = 'active',
): Promise<MountResult> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProjectCardMenu, NoopAnimationsModule],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(ProjectCardMenu);
  fixture.componentRef.setInput('project', project);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('ProjectCardMenu', () => {
  it('renders the trigger with aria-haspopup and dynamic aria-label', async () => {
    const { fixture } = await mount(sampleProject({ name: 'Cool Project' }));
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-testid="project-card-menu-trigger"]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.getAttribute('aria-label')).toBe(
      'Project actions for Cool Project',
    );
  });

  it('active mode shows "Archive" label', async () => {
    const { component } = await mount(sampleProject(), 'active');
    expect(
      (component as unknown as { archiveLabel: () => string }).archiveLabel(),
    ).toBe('Archive');
  });

  it('archived mode shows "Unarchive" label', async () => {
    const { component } = await mount(
      sampleProject({ archived_at: '2026-01-02T00:00:00Z' }),
      'archived',
    );
    expect(
      (component as unknown as { archiveLabel: () => string }).archiveLabel(),
    ).toBe('Unarchive');
  });

  it('clicking the Edit item emits the edit output with the project id and trigger', async () => {
    const { component } = await mount(sampleProject({ id: 99 }));
    const editSpy = vi.spyOn(component.edit, 'emit');
    const trigger = document.createElement('button');
    (component as unknown as { onEdit: (t: HTMLElement) => void }).onEdit(
      trigger,
    );
    expect(editSpy).toHaveBeenCalledTimes(1);
    const payload = editSpy.mock.calls[0][0];
    expect(payload.id).toBe(99);
    expect(payload.trigger).toBe(trigger);
  });

  it('clicking the Archive item in active mode emits the archive output', async () => {
    const { component } = await mount(sampleProject({ id: 11 }), 'active');
    const archiveSpy = vi.spyOn(component.archive, 'emit');
    const trigger = document.createElement('button');
    (component as unknown as { onArchiveToggle: (t: HTMLElement) => void }).onArchiveToggle(
      trigger,
    );
    expect(archiveSpy).toHaveBeenCalledTimes(1);
    expect(archiveSpy.mock.calls[0][0].id).toBe(11);
    expect(archiveSpy.mock.calls[0][0].trigger).toBe(trigger);
  });

  it('clicking the Archive item in archived mode emits the unarchive output', async () => {
    const { component } = await mount(
      sampleProject({ id: 11, archived_at: '2026-01-02T00:00:00Z' }),
      'archived',
    );
    const unarchiveSpy = vi.spyOn(component.unarchive, 'emit');
    const trigger = document.createElement('button');
    (component as unknown as { onArchiveToggle: (t: HTMLElement) => void }).onArchiveToggle(
      trigger,
    );
    expect(unarchiveSpy).toHaveBeenCalledTimes(1);
    expect(unarchiveSpy.mock.calls[0][0].id).toBe(11);
  });

  it('clicking the Delete item emits the delete output with the project id', async () => {
    const { component } = await mount(sampleProject({ id: 7 }));
    const deleteSpy = vi.spyOn(component.delete, 'emit');
    const trigger = document.createElement('button');
    (component as unknown as { onDelete: (t: HTMLElement) => void }).onDelete(
      trigger,
    );
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy.mock.calls[0][0].id).toBe(7);
  });
});
