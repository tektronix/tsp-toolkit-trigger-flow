import { Component, OnInit } from '@angular/core';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { TriggerBlocksService, TriggerBlocksData } from '../services/trigger-blocks.service';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, Canvas, SidePanelAccordion, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.css',
})
export class MainFlow implements OnInit {
  sidebarCollapsed = false;
  triggerBlocksData: TriggerBlocksData | null = null;
  
  constructor(private triggerBlocksService: TriggerBlocksService) {}

  ngOnInit(): void {
    this.triggerBlocksService.getTriggerBlocks().subscribe({
      next: (data) => {
        this.triggerBlocksData = data;
        console.log('Trigger blocks loaded:', data);
      },
      error: (error) => {
        console.error('Error loading trigger blocks:', error);
      }
    });
  }
  
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
