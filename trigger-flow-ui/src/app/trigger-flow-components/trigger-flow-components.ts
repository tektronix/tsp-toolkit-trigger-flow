
import { Component } from '@angular/core';
import { FlowCanvas } from './flow-canvas/flow-canvas';
import { Palette } from './palette/palette';
import { SidePanelAccordion } from './side-panel-accordian/side-panel-accordian';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-trigger-flow-components',
  imports: [CommonModule, FlowCanvas, Palette, SidePanelAccordion, MatIconModule],
  templateUrl: './trigger-flow-components.html',
  styleUrl: './trigger-flow-components.css',
})
export class TriggerFlowComponents {
  sidebarCollapsed = false;
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
