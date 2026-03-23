import { Component, OnInit, inject } from '@angular/core';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { TriggerBlocksService } from '../services/trigger-blocks.service';
import { CanvasBlocksService } from '../services/canvas-blocks.service';
import { TriggerBlocks } from '../models/trigger-blocks.model';
import { Websocket } from '../services/websocket';
import { IpcData } from '../models/ipcData';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, Canvas, SidePanelAccordion, BlockParameters, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.css',
})
export class MainFlow implements OnInit {
  private triggerBlocksService = inject(TriggerBlocksService);
  private canvasBlocksService = inject(CanvasBlocksService);
  private websocket = inject(Websocket);

  sidebarCollapsed = false;
  catalogData: TriggerBlocks | null = null;
  slotChannelList: any = null;

  ngOnInit(): void {
    this.loadCatalogData();
    this.websocket.connect();
    this.websocket.getMessages().subscribe((msg: string) => {
      try {
        const ipcData = JSON.parse(msg) as IpcData;
        let jsonValueObj: any = ipcData.json_value;
        if (typeof jsonValueObj === 'string') {
          try {
            jsonValueObj = JSON.parse(jsonValueObj);
          } catch (e) {
            console.error('Failed to parse ipcData.json_value:', ipcData.json_value, e);
          }
        }
        switch (ipcData.request_type) {
          case 'initial_response':            
          case 'evaluate_response':
            if (jsonValueObj.slot_channel_list) {
              this.slotChannelList = jsonValueObj.slot_channel_list;
              console.log('Received slot_channel_list:', this.slotChannelList);
              this.canvasBlocksService.setSlotChannelList(this.slotChannelList);
            }
            else {
              console.error('slot_channel_list property is missing in the data');
            }
            break;
          default:
            console.log('Unhandled request_type:', ipcData.request_type);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', msg, e);
      }
    });
  }

  private loadCatalogData(): void {
    this.triggerBlocksService.getTriggerBlocks().subscribe({
      next: (data) => {
        this.catalogData = data;
        this.canvasBlocksService.setCatalogData(data);
        console.log('Trigger blocks catalog loaded:', this.catalogData);
      },
      error: (error) => {
        console.error('Error loading trigger blocks catalog:', error);
      }
    });
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
