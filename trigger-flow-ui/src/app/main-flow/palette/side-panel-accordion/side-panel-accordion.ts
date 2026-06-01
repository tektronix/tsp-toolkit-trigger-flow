import { Component, inject, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FFlowModule } from '@foblex/flow';
import { PaletteDataService } from '../../../services/palette-data.service';

@Component({
  selector: 'app-side-panel-accordion',
  standalone: true,
  imports: [MatIconModule, CommonModule, FFlowModule],
  templateUrl: './side-panel-accordion.html',
  styleUrl: './side-panel-accordion.scss',
})
export class SidePanelAccordion {
  private paletteDataService = inject(PaletteDataService);
  
  // Get the complete groups structure from the service
  groups = computed(() => this.paletteDataService.getGroupsStructure());

  // Templates rendered inside the 'Templates' (single) accordion section
  templates = computed(() => this.paletteDataService.getTemplates());

  expanded: Set<number> = new Set<number>();
  blockExpanded: Set<number> = new Set<number>();
  
  getSVGPathByCatalogLabel(catalogLabel: string): string | undefined {
    return this.paletteDataService.getSVGPathByCatalogLabel(catalogLabel);
  }
  
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
