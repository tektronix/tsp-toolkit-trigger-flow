import { Component, inject, OnInit, signal } from '@angular/core';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { TriggerBlocksService } from '../services/trigger-blocks.service';
import { BlockTransformerService } from '../services/block-transformer.service';
import { PaletteGroup } from '../models/trigger-block.model';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, Canvas, SidePanelAccordion, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.css',
})
export class MainFlow implements OnInit {
  private triggerBlocksService = inject(TriggerBlocksService);
  private blockTransformer = inject(BlockTransformerService);

  sidebarCollapsed = false;
  paletteGroups = signal<PaletteGroup[]>([]);
  
  ngOnInit() {
    // Load and transform trigger blocks data
    this.blockTransformer
      .transformObservable(this.triggerBlocksService.getTriggerBlocks())
      .subscribe(groups => {
        this.paletteGroups.set(groups);
        console.log('Palette groups loaded:', groups);
      });
  }
  
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }
}
