import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FFlowModule } from '@foblex/flow';

@Component({
  selector: 'app-side-panel-accordion',
  standalone: true,
  imports: [MatIconModule, CommonModule, FFlowModule],
  templateUrl: './side-panel-accordion.html',
  styleUrl: './side-panel-accordion.scss',
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
            {
              type: 'action-1',
              svgPath: 'assets/shapes/Actions/Config List Next.svg',
              catalogLabel: 'configlist next',
            },
          ],
        },
        {
          label: 'Branches',
          shapes: [
            {
              type: 'branch-1',
              svgPath: 'assets/shapes/Branches/Always.svg',
              catalogLabel: 'always',
            },
            {
              type: 'branch-2',
              svgPath: 'assets/shapes/Branches/On Event.svg',
              catalogLabel: 'event',
            },
          ],
        },
        {
          label: 'Notify',
          shapes: [
            {
              type: 'notify-1',
              svgPath: 'assets/shapes/Notify/Notify Block Template.svg',
              catalogLabel: 'notify',
            },
          ],
        },
        {
          label: 'Timing',
          shapes: [
            {
              type: 'timer-1',
              svgPath: 'assets/shapes/Timing/Constant Delay.svg',
              catalogLabel: 'delay constant',
            },
          ],
        },
      ],
    },
    { label: 'Events', type: 'single' },
  ];

  expanded: Set<number> = new Set<number>();
  blockExpanded: Set<number> = new Set<number>();

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
