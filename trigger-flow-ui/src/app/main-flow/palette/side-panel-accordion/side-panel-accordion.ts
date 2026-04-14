import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FFlowModule } from '@foblex/flow';

@Component({
  selector: 'app-side-panel-accordion',
  standalone: true,
  imports: [MatIconModule, CommonModule, FFlowModule],
  templateUrl: './side-panel-accordion.html',
  styleUrls: ['./side-panel-accordion.css'],
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
            { type: 'action-1', svgPath: 'assets/shapes/palette/Action/Action-ConfigListNext.svg', catalogLabel: 'configlist next' },
            { type: 'action-2', svgPath: 'assets/shapes/palette/Action/Action-ConfigListPrev.svg', catalogLabel: 'configlist prev' },
            { type: 'action-3', svgPath: 'assets/shapes/palette/Action/Action-ConfigListRecall.svg', catalogLabel: 'configlist recall' },
            { type: 'action-4', svgPath: 'assets/shapes/palette/Action/Action-Measure.svg', catalogLabel: 'measure' },
            { type: 'action-5', svgPath: 'assets/shapes/palette/Action/Action-MeasureOverlapped.svg', catalogLabel: 'measure overlapped' },
            { type: 'action-6', svgPath: 'assets/shapes/palette/Action/Action-NoOperation.svg', catalogLabel: 'no operation' },
            { type: 'action-7', svgPath: 'assets/shapes/palette/Action/Action-ResetBranchCounter.svg', catalogLabel: 'reset branch counter' },
            { type: 'action-8', svgPath: 'assets/shapes/palette/Action/Action-SourceActionBias.svg', catalogLabel: 'source action bias' },
            { type: 'action-9', svgPath: 'assets/shapes/palette/Action/Action-SourceActionSkip.svg', catalogLabel: 'source action skip' },
            { type: 'action-10', svgPath: 'assets/shapes/palette/Action/Action-SourceActionStep.svg', catalogLabel: 'source action step' },
            { type: 'action-11', svgPath: 'assets/shapes/palette/Action/Action-SourceOutput.svg', catalogLabel: 'source output' },
          ]
        },
        {
          label: 'Branches',
          shapes: [
            { type: 'branch-1', svgPath: 'assets/shapes/palette/Branch/BranchBlock-Always.svg', catalogLabel: 'always' },
            { type: 'branch-2', svgPath: 'assets/shapes/palette/Branch/BranchBlock-OnceExcluded.svg', catalogLabel: 'once excluded' },
            { type: 'branch-3', svgPath: 'assets/shapes/palette/Branch/BranchBlock-OnEvent.svg', catalogLabel: 'on event' },
          ]
        },
        {
          label: 'Notify',
          shapes: [
            { type: 'notify-1', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-LogEvent.svg', catalogLabel: 'log event' },
            { type: 'notify-2', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-Notify.svg', catalogLabel: 'notify' },
          ]
        },
        {
          label: 'Timing',
          shapes: [
            { type: 'timer-1', svgPath: 'assets/shapes/palette/Timing/Timing-ConstantDelay.svg', catalogLabel: 'delay constant' },
            { type: 'timer-2', svgPath: 'assets/shapes/palette/Timing/Timing-WaitOnEvent.svg', catalogLabel: 'wait on event' },
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
