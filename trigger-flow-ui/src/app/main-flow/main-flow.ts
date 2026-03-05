import { Component, OnInit, inject } from '@angular/core';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { TriggerBlocksService } from '../services/trigger-blocks.service';
import { CanvasBlocksService } from '../services/canvas-blocks.service';
import { TriggerBlocks } from '../models/trigger-blocks.model';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, Canvas, SidePanelAccordion, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.css',
})
export class MainFlow implements OnInit {
  private triggerBlocksService = inject(TriggerBlocksService);
  private canvasBlocksService = inject(CanvasBlocksService);

  sidebarCollapsed = false;
  catalogData: TriggerBlocks | null = null;

  ngOnInit(): void {
    this.loadCatalogData();
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
