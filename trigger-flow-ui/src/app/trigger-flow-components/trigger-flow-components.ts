
import { Component } from '@angular/core';
import { FlowCanvas } from './flow-canvas/flow-canvas';
import { Palette } from './palette/palette';
import { SidePanelAccordionComponent } from './side-panel-accordion.component';

@Component({
  selector: 'app-trigger-flow-components',
  imports: [FlowCanvas, Palette, SidePanelAccordionComponent],
  templateUrl: './trigger-flow-components.html',
  styleUrl: './trigger-flow-components.css',
})
export class TriggerFlowComponents {

}
