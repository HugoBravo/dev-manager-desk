import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { UserFormComponent, type UserFormErrors, type UserFormValue } from './user-form.component';

describe('UserFormComponent', () => {
  let fixture: ComponentFixture<UserFormComponent>;
  let component: UserFormComponent;

  function create(
    initial: UserFormValue,
    errors: UserFormErrors,
    isAdmin: boolean,
    isSelf: boolean,
  ): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [UserFormComponent],
      providers: [provideAnimationsAsync()],
    });
    fixture = TestBed.createComponent(UserFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('initialValue', initial);
    fixture.componentRef.setInput('errors', errors);
    fixture.componentRef.setInput('isAdmin', isAdmin);
    fixture.componentRef.setInput('isSelf', isSelf);
    fixture.componentRef.setInput('submitting', false);
    fixture.detectChanges();
  }

  it('renders all fields when isAdmin=true', () => {
    create(
      { name: 'Jane', email: 'jane@example.com', password: '', is_admin: false },
      {},
      true,
      false,
    );
    expect(fixture.nativeElement.querySelector('[data-testid="user-form-email"]')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="user-form-is-admin"]'),
    ).not.toBeNull();
  });

  it('hides is_admin and locks email when not admin and not self', () => {
    create({ name: '', email: '', password: '', is_admin: false }, {}, false, false);
    expect(fixture.nativeElement.querySelector('[data-testid="user-form-is-admin"]')).toBeNull();
    const email: HTMLInputElement | null = fixture.nativeElement.querySelector(
      '[data-testid="user-form-email"]',
    );
    expect(email?.readOnly).toBe(true);
  });

  it('emits a normalised UserFormValue on submit', () => {
    let received: UserFormValue | null = null;
    create({ name: '', email: '', password: '', is_admin: false }, {}, true, false);
    component.submitted.subscribe((value) => (received = value));
    component.formGroup.setValue({
      name: '  Renamed  ',
      email: ' renamed@example.com ',
      password: 'pw1234567',
      is_admin: true,
    });
    component.onSubmit(new Event('submit'));
    expect(received).toEqual({
      name: 'Renamed',
      email: 'renamed@example.com',
      password: 'pw1234567',
      is_admin: true,
    });
  });

  it('renders aria-describedby for the name field when errors.name is set', () => {
    create(
      { name: '', email: '', password: '', is_admin: false },
      { name: 'Required' },
      true,
      false,
    );
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector(
      '[data-testid="user-form-name"]',
    );
    expect(input?.getAttribute('aria-describedby')).toBe('user-form-name-error');
  });
});
