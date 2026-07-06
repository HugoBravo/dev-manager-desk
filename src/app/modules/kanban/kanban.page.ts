import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-kanban-page',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './kanban.page.html',
  styles: [
    `
      :host {
        display: block;
      }

      .kanban-placeholder {
        display: flex;
        justify-content: center;
        padding: 32px 16px;
      }

      .kanban-card {
        max-width: 480px;
        width: 100%;
        text-align: center;
      }

      mat-card-header {
        justify-content: center;
      }

      mat-card-content p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-medium);
      }
    `,
  ],
})
export class KanbanPage {}