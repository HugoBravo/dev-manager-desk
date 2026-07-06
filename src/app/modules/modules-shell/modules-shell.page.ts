import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-modules-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './modules-shell.page.html',
  styleUrl: './modules-shell.page.scss',
})
export class ModulesShellPage {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sidenavOpened = signal(true);

  private readonly isHandsetSignal = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: { matches: false, breakpoints: {} } },
  );

  protected readonly isHandset = computed(() => this.isHandsetSignal().matches);

  protected readonly sidenavMode = computed<'over' | 'side'>(() =>
    this.isHandset() ? 'over' : 'side',
  );

  protected readonly user = this.auth.user;

  protected toggleSidenav(): void {
    this.sidenavOpened.update((open) => !open);
  }

  protected closeSidenavIfHandset(): void {
    if (this.isHandset()) {
      this.sidenavOpened.set(false);
    }
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}