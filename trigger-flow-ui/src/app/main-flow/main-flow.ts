import { Component } from '@angular/core';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { vscode } from '../services/canvas-blocks.service';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, Canvas, SidePanelAccordion, BlockParameters, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.scss',
})
export class MainFlow{
  
  sidebarCollapsed = false;

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  openScript(): void {
    console.log('Open Script clicked');
    vscode.postMessage({ command: 'open_script'});
  }

  addNewTriggerModel(): void {
    console.log('Model Settings clicked');
    // TODO: Open model settings dialog
  }
}
