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
export class SidePanelAccordion {
  groups = [
    { label: 'Templates', type: 'single' },
    {
      label: 'Blocks',
      type: 'group',
      subgroups: [
        { label: 'Branches' },
        { label: 'Actions' },
        { label: 'Timing' },
        { label: 'Notify' }
      ]
    },
    { label: 'Events', type: 'single' }
  ];
  expanded: Set<number> = new Set();
  blockExpanded: Set<number> = new Set();

  togglePanel(idx: number) {
    if (this.expanded.has(idx)) {
      this.expanded.delete(idx);
    } else {
      this.expanded.add(idx);
    }
    // Force change detection
    this.expanded = new Set(this.expanded);
  }

  toggleBlock(idx: number) {
    if (this.blockExpanded.has(idx)) {
      this.blockExpanded.delete(idx);
    } else {
      this.blockExpanded.add(idx);
    }
    // Force change detection
    this.blockExpanded = new Set(this.blockExpanded);
  }
}
