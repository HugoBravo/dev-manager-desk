import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, type ThemeMode } from '../../core/theme/theme.service';
import { ToolbarProjectPickerComponent } from '../../layout/toolbar-project-picker/toolbar-project-picker.component';

const APP_NAME = 'Dev Manager Desk';
const APP_VERSION = '0.0.0';

@Component({
  selector: 'app-modules-shell',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
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
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

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

  protected readonly sidebarCollapsed = signal(false);

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  protected readonly user = this.auth.user;

  protected readonly APP_NAME = APP_NAME;
  protected readonly APP_VERSION = APP_VERSION;

  protected readonly userInitials = computed(() => {
    const name = this.user()?.name ?? '';
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  });

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}