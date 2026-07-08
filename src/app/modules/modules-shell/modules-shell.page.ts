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
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, type ThemeMode } from '../../core/theme/theme.service';
import { ToolbarProjectPickerComponent } from '../../layout/toolbar-project-picker/toolbar-project-picker.component';

@Component({
  selector: 'app-modules-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatMenuModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    ToolbarProjectPickerComponent,
  ],
  templateUrl: './modules-shell.page.html',
  styleUrl: './modules-shell.page.scss',
})
export class ModulesShellPage {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly sidenavOpened = signal(true);

  protected readonly themeMode = this.theme.mode;

  protected readonly themeIcon = computed(() => {
    const mode = this.themeMode();
    if (mode === 'light') {
      return 'light_mode';
    }
    if (mode === 'dark') {
      return 'dark_mode';
    }
    return 'brightness_auto';
  });

  protected readonly themeLabel = computed(() => {
    const mode = this.themeMode();
    if (mode === 'light') {
      return 'Cambiar a tema oscuro';
    }
    if (mode === 'dark') {
      return 'Cambiar a tema del sistema';
    }
    return 'Cambiar a tema claro';
  });

  protected setThemeMode(mode: ThemeMode): void {
    this.theme.set(mode);
  }

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