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
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListNext.svg', catalogLabel: 'configlist next' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListPrev.svg', catalogLabel: 'configlist prev' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListRecall.svg', catalogLabel: 'configlist recall' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-Measure.svg', catalogLabel: 'measure' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-MeasureOverlapped.svg', catalogLabel: 'measure overlapped' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-NoOperation.svg', catalogLabel: 'no operation' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ResetBranchCounter.svg', catalogLabel: 'reset counter' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionBias.svg', catalogLabel: 'source action bias' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionSkip.svg', catalogLabel: 'source action skip' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionStep.svg', catalogLabel: 'source action step' },
            { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceOutput.svg', catalogLabel: 'source output' },
          ]
        },
        {
          label: 'Branches',
          shapes: [
            { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-Always.svg', catalogLabel: 'always' },
            { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-OnceExcluded.svg', catalogLabel: 'onceexcluded' },
            { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-Counter.svg', catalogLabel: 'counter' },
          ]
        },
        {
          label: 'Notify',
          shapes: [
            { type: 'Notify', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-LogEvent.svg', catalogLabel: 'log_event' },
            { type: 'Notify', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-Notify.svg', catalogLabel: 'notify' },
          ]
        },
        {
          label: 'Timing',
          shapes: [
            { type: 'Timing', svgPath: 'assets/shapes/palette/Timing/Timing-ConstantDelay.svg', catalogLabel: 'delay constant' },
            { type: 'Timing', svgPath: 'assets/shapes/palette/Timing/Timing-WaitOnEvent.svg', catalogLabel: 'wait' },
          ]
        }
      ]
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
