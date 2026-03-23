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


declare const acquireVsCodeApi: unknown;
// eslint-disable-next-line @typescript-eslint/no-empty-function
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: () => {} };

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
  private slotChannelList: any = null;

  setCatalogData(catalog: TriggerBlocks): void {
    this.catalogData = catalog;
  }

  setSlotChannelList(slotChannelList: any): void {
    this.slotChannelList = slotChannelList;
  }

  // Support multiple models per canvas
  private models: { [modelName: string]: {
    trigger_model_name: string;
    slot_index: number;
    blocks: CanvasBlock[];
  }} = {};

  addBlock(nodeId: string, blockLabel: string, position: { x: number; y: number }, modelName: string, slotIndex: number): void {
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

    if (!this.models[modelName]) {
      this.models[modelName] = {
        trigger_model_name: modelName,
        slot_index: slotIndex,
        blocks: []
      };
    }

    const canvasBlock: CanvasBlock = {
      id: nodeId,
      blockName: blockName,
      blockData: blockData,
      position: position,
      svgPath: blockLabel
    };

    this.models[modelName].blocks.push(canvasBlock);
    this.updateAndPrint();
    vscode.postMessage({ command: 'open_manual' , payload: "block_name: " + blockName});
  }

  // Remove block by nodeId from the model where it exists
  removeBlock(nodeId: string): void {
    for (const model of Object.values(this.models)) {
      const index = model.blocks.findIndex(b => b.id === nodeId);
      if (index !== -1) {
        model.blocks.splice(index, 1);
        this.updateAndPrint();
        break;
      }
    }

  }

  updateBlockPosition(nodeId: string, position: { x: number; y: number }): void {
    for (const model of Object.values(this.models)) {
      const block = model.blocks.find(b => b.id === nodeId);
      if (block) {
        block.position = position;
        this.updateAndPrint();
        break;
      }
    }
  }

  clearAll(): void {
    for (const model of Object.values(this.models)) {
      model.blocks = [];
    }
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
    this.logIpcDataFormat();
  }

  logIpcDataFormat(): void {
    // Use slotChannelList from MainFlow if available
    const slot_channel_list = this.slotChannelList || { slots: [] };
    // Build models object, omitting syntax, description, and shape from blocks
    const filteredModels: any = {};
    for (const [modelName, model] of Object.entries(this.models)) {
      filteredModels[modelName] = {
        trigger_model_name: model.trigger_model_name,
        slot_index: model.slot_index,
        blocks: model.blocks.map(block => {
          // Copy only allowed properties from block and blockData
          const { id, blockName, position, svgPath } = block;
          // Extract block_parameters and other needed fields from blockData
          const blockData = block.blockData as any;
          // Remove syntax, description, shape if present
          const { syntax, description, shape, ...blockDataRest } = blockData;
          return {
            id,
            blockName,
            position,
            svgPath,
            ...blockDataRest
          };
        })
      };
    }
    const ipcData = {
      request_type: 'evaluate_request',
      additional_info: '',
      json_value: {
        slot_channel_list,
        models: filteredModels
      }
    };
    console.log('=== Rust IpcData Format ===');
    console.log(JSON.stringify(ipcData, null, 2));
    console.log('==========================');
  }


  getCanvasDataAsJson(): string {
    return JSON.stringify(this.getCanvasData(), null, 2);
  }
}
