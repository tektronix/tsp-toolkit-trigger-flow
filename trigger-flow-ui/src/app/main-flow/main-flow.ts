import { Component, effect, inject } from '@angular/core';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { CanvasBlocksService } from '../services/canvas-blocks.service';
import { TriggerFlowDataService } from '../services/triggerFlowDataService';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, Canvas, SidePanelAccordion, BlockParameters, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.css',
})
export class MainFlow{
  private triggerFlowDataService = inject(TriggerFlowDataService);
  private canvasBlocksService = inject(CanvasBlocksService);
  
  sidebarCollapsed = false;
  // Use service signals directly - automatically reactive
  catalogData = this.triggerFlowDataService.catalog;
  slotChannelList = this.triggerFlowDataService.slotChannelList;

  constructor() {
    // Watch catalog changes and update canvas blocks service
    effect(() => {
      const catalog = this.catalogData();
      const slotChannelList = this.slotChannelList();
      if (catalog) {
        this.canvasBlocksService.setCatalogData(catalog);
        console.log('Catalog data available:', catalog);
      }
      if (slotChannelList) {
        this.canvasBlocksService.setSlotChannelList(slotChannelList);
        console.log('Slot channel list available:', slotChannelList);
      }
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
