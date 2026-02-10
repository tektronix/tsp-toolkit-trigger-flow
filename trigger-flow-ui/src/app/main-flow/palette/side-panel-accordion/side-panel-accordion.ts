import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FFlowModule } from '@foblex/flow';

@Component({
  selector: 'app-side-panel-accordion',
  standalone: true,
  imports: [MatIconModule, CommonModule, FFlowModule],
  templateUrl: './side-panel-accordion.html',
  styleUrls: ['./side-panel-accordion.css']
})
export class SidePanelAccordion {
  groups = [
    { label: 'Templates', type: 'single' },
    {
      label: 'Blocks',
      type: 'group',
      subgroups: [
        { 
          label: 'Actions', 
          shapes: [
            { type: 'action-1', svgPath: 'assets/shapes/notify.svg', label: 'Action 1' },
            { type: 'action-2', svgPath: 'assets/shapes/notify.svg', label: 'Action 2' }
          ]
        },
        { 
          label: 'Branches',
          shapes: [
            { type: 'branch-1', svgPath: 'assets/shapes/notify.svg', label: 'Branch 1' },
            { type: 'branch-2', svgPath: 'assets/shapes/notify.svg', label: 'Branch 2' }
          ]
        },
        { 
          label: 'Notify',
          shapes: [
            { type: 'notify-1', svgPath: 'assets/shapes/notify.svg', label: 'Notify 1' }
          ]
        },
        { 
          label: 'Timing',
          shapes: [
            { type: 'timer-1', svgPath: 'assets/shapes/notify.svg', label: 'Timer 1' },
            { type: 'timer-2', svgPath: 'assets/shapes/notify.svg', label: 'Timer 2' },
            { type: 'timer-3', svgPath: 'assets/shapes/notify.svg', label: 'Timer 3' }
          ]
        }
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
    this.expanded = new Set(this.expanded);
  }

  toggleBlock(idx: number) {
    if (this.blockExpanded.has(idx)) {
      this.blockExpanded.delete(idx);
    } else {
      this.blockExpanded.add(idx);
    }
    this.blockExpanded = new Set(this.blockExpanded);
  }
}
