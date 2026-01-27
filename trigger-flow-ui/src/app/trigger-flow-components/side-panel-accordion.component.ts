import { Component } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-side-panel-accordion',
  standalone: true,
  imports: [MatExpansionModule, CommonModule],
  template: `
    <mat-accordion>
      <mat-expansion-panel *ngFor="let group of groups">
        <mat-expansion-panel-header>
          <mat-panel-title>{{ group }}</mat-panel-title>
        </mat-expansion-panel-header>
        <div style="padding: 1rem;">Content for {{ group }}</div>
      </mat-expansion-panel>
    </mat-accordion>
  `
})
export class SidePanelAccordionComponent {
  groups = ['Branch', 'Action', 'Timing', 'Notify', 'Events', 'Templates'];
}
