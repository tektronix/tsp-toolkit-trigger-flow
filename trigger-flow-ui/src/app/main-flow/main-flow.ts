import { Component } from '@angular/core';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, Canvas, SidePanelAccordion, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.css',
})
export class MainFlow {
  sidebarCollapsed = false;
  
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
