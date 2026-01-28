import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-side-panel-accordian',
  standalone: true,
  imports: [MatIconModule, CommonModule],
  templateUrl: './side-panel-accordian.html',
  styleUrls: ['./side-panel-accordian.css']
})
export class SidePanelAccordian {
  groups = ['Branch', 'Action', 'Timing', 'Notify', 'Events', 'Templates'];
  expanded: number | null = null;

  togglePanel(idx: number) {
    this.expanded = this.expanded === idx ? null : idx;
  }
}
