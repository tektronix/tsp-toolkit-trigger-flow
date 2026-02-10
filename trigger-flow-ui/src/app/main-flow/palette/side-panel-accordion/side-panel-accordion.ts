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
  rectangleSvg = 'assets/shapes/notify.svg';
  rectangleData = { svgPath: 'assets/shapes/notify.svg' };
  groups = [
    { label: 'Templates', type: 'single' },
    {
      label: 'Blocks',
      type: 'group',
      subgroups: [
        { label: 'Branches' },
        { label: 'Actions', hasRectangle: true },
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
