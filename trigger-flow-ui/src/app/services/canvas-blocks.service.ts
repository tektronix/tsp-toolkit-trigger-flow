import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TriggerBlocks, BlockDefinition, EventDefinition } from '../models/trigger-blocks.model';

export interface CanvasBlock {
  id: string;
  blockName: string;
  blockData: BlockDefinition | EventDefinition;
  position: { x: number; y: number };
  svgPath: string;
}

export interface CanvasBlocksData {
  blocks: CanvasBlock[];
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class CanvasBlocksService {
  private canvasBlocks: CanvasBlock[] = [];
  private canvasBlocksSubject = new BehaviorSubject<CanvasBlocksData>(this.getCanvasData());
  public canvasBlocks$ = this.canvasBlocksSubject.asObservable();
  
  private catalogData: TriggerBlocks | null = null;

  setCatalogData(catalog: TriggerBlocks): void {
    this.catalogData = catalog;
  }

  addBlock(nodeId: string, blockLabel: string, position: { x: number; y: number }): void {
    if (!this.catalogData) {
      console.warn('Catalog data not loaded yet');
      return;
    }

    const blockName = blockLabel.toLowerCase().trim();
    
    if (!blockName) {
      console.warn('Block label is empty');
      return;
    }

    // Search for block in catalog (case-insensitive)
    const blockData = this.findBlockInCatalog(blockName);
    
    if (!blockData) {
      console.warn(`Block "${blockName}" not found in catalog`);
      return;
    }

    const canvasBlock: CanvasBlock = {
      id: nodeId,
      blockName: blockName,
      blockData: blockData,
      position: position,
      svgPath: blockLabel
    };

    this.canvasBlocks.push(canvasBlock);
    this.updateAndPrint();
  }

  removeBlock(nodeId: string): void {
    const index = this.canvasBlocks.findIndex(b => b.id === nodeId);
    if (index !== -1) {
      this.canvasBlocks.splice(index, 1);
      this.updateAndPrint();
    }
  }

  updateBlockPosition(nodeId: string, position: { x: number; y: number }): void {
    const block = this.canvasBlocks.find(b => b.id === nodeId);
    if (block) {
      block.position = position;
      this.updateAndPrint();
    }
  }

  clearAll(): void {
    this.canvasBlocks = [];
    this.updateAndPrint();
  }

  private findBlockInCatalog(blockName: string): BlockDefinition | EventDefinition | null {
    if (!this.catalogData) return null;

    const normalizedBlockName = blockName.toLowerCase().replace(/\s+/g, ' ').trim();

    // Search in blocks
    if (this.catalogData.blocks) {
      for (const [key, value] of Object.entries(this.catalogData.blocks)) {
        const normalizedKey = key.toLowerCase().replace(/\s+/g, ' ').trim();
        if (normalizedKey === normalizedBlockName) {
          return value;
        }
      }
    }

    // Search in trigger_events
    if (this.catalogData.trigger_events) {
      for (const [key, value] of Object.entries(this.catalogData.trigger_events)) {
        const normalizedKey = key.toLowerCase().replace(/\s+/g, ' ').trim();
        if (normalizedKey === normalizedBlockName) {
          return value;
        }
      }
    }

    return null;
  }

  private getCanvasData(): CanvasBlocksData {
    return {
      blocks: this.canvasBlocks,
      timestamp: new Date().toISOString()
    };
  }

  private updateAndPrint(): void {
    const data = this.getCanvasData();
    this.canvasBlocksSubject.next(data);
    
    console.log('=== Canvas Blocks JSON ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('========================');
  }

  getCanvasDataAsJson(): string {
    return JSON.stringify(this.getCanvasData(), null, 2);
  }
}
