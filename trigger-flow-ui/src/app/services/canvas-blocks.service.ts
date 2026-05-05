import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Catalog, BlockDefinition, ActualParameter } from '../models/triggerBlock';
import { Websocket } from './websocket';
import { TriggerFlowDataService } from './triggerFlowDataService';
import { IIpcDataInterface } from '../models/interface';
import { BlockErrorEntry, TriggerModel } from '../models/triggerFlowState';


export interface CanvasBlock {
  block_id: string;
  type: string;
  blockData: BlockDefinition;
  block_position: { x: number; y: number };
  incoming: string | null;
  outgoing: string | null;
  block_error: BlockErrorEntry[] | null;
  actual_parameters: ActualParameter[]; // To store actual values
}

declare const acquireVsCodeApi: unknown;
// eslint-disable-next-line @typescript-eslint/no-empty-function
export const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: () => { } };

export interface CanvasBlocksData {
  blocks: Record<string, { trigger_model_name: string; slot_index: number; blocks: CanvasBlock[]; }>;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class CanvasBlocksService {
  private triggerFlowDataService = inject(TriggerFlowDataService);
  private websocketService = inject(Websocket);

  private canvasBlocksSubject = new BehaviorSubject<CanvasBlocksData>(this.getCanvasData());
  public canvasBlocks$ = this.canvasBlocksSubject.asObservable();

  // Support multiple models per canvas
  private models: Record<string, {
    trigger_model_name: string;
    slot_index: number;
    blocks: CanvasBlock[];
  }> = {};
  private selectedBlockSubject = new BehaviorSubject<string | null>(null);
  public selectedBlock$ = this.selectedBlockSubject.asObservable();

  constructor() {
    // Register this service so TriggerFlowDataService can push runtime state.
    this.triggerFlowDataService.canvas = this;
  }

  private toParameterMap(params: ActualParameter[]): Record<string, unknown> {
    return params.reduce((acc, param) => {
      acc[param.name] = param.value ?? param.default ?? null;
      return acc;
    }, {} as Record<string, unknown>);
  }

  /**
   * Set the data for the trigger model of this canvas
   * @param models The list of models to set the local model to.
   */
  setBlockData(models: Record<string, TriggerModel>): void {
    console.log('setBlockData:', models);

    const nextModels: Record<
      string,
      {
        trigger_model_name: string;
        slot_index: number;
        blocks: CanvasBlock[];
      }
    > = {};

    for (const [name, model] of Object.entries(models)) {
      const blocks = model.blocks
        .map((item) => {
          const blockData =
            this.findBlockInCatalog(item.type, this.triggerFlowDataService.getCatalog()) ??
            this.createFallbackBlockDefinition();

          const canvasBlock: CanvasBlock = {
            block_id: item.block_id,
            type: item.type,
            blockData,
            block_position: item.block_position,
            incoming: item.incoming,
            outgoing: item.outgoing,
            block_error: item.block_error,
            actual_parameters: blockData.parameters.map((param) => {
              const actual = new ActualParameter(param);
              actual.value = item.block_parameters[param.name] ?? actual.value;
              return actual;
            }),
          };

          return canvasBlock;
        })
        .filter((item): item is CanvasBlock => item !== null);

      nextModels[name] = {
        trigger_model_name: model.trigger_model_name,
        slot_index: model.slot_index,
        blocks,
      };
    }

    this.models = nextModels;
    this.update(this.getCanvasData());
  }

  ensureModel(modelName: string, slotIndex: number): void {
    if (!modelName.trim()) {
      return;
    }

    if (!this.models[modelName]) {
      this.models[modelName] = {
        trigger_model_name: modelName,
        slot_index: slotIndex,
        blocks: [],
      };
      this.updateAndPrint();
      return;
    }

    if (this.models[modelName].slot_index !== slotIndex) {
      this.models[modelName] = {
        ...this.models[modelName],
        slot_index: slotIndex,
      };
      this.updateAndPrint();
    }
  }

  addBlock(
    blockId: string,
    blockLabel: string,
    position: { x: number; y: number },
    modelName: string,
    slotIndex: number,
  ): void {
    const catalogData = this.triggerFlowDataService.getCatalog();
    if (!catalogData) {
      console.warn('Catalog data not loaded yet');
      return;
    }

    blockLabel = blockLabel.toLowerCase().trim();

    if (!blockLabel) {
      console.warn('Block label is empty');
      return;
    }

    // Search for block in catalog (case-insensitive)
    const blockData = this.findBlockInCatalog(blockLabel, catalogData);

    if (!blockData) {
      console.warn(`Block "${blockLabel}" not found in catalog`);
      return;
    }

    if (!this.models[modelName]) {
      this.models[modelName] = {
        trigger_model_name: modelName,
        slot_index: slotIndex,
        blocks: [],
      };
    }

    // Initialize ActualParameter[] from blockData.parameters
    const actualParameters: ActualParameter[] = blockData.parameters.map(
      (param) => new ActualParameter(param)
    );

    const canvasBlock: CanvasBlock = {
      block_id: blockId,
      type: blockLabel,
      blockData: blockData,
      block_position: position,
      incoming: null,
      outgoing: null,
      block_error: null,
      actual_parameters: actualParameters,
    };

    this.models[modelName].blocks.push(canvasBlock);
    this.sortBlocksByVerticalPosition(this.models[modelName]);
    this.updateAndPrint();
    //vscode.postMessage({ command: 'open_manual', payload: 'block_name: ' + blockName });
  }

  // Remove block by nodeId from the model where it exists
  removeBlock(nodeId: string): void {
    for (const model of Object.values(this.models)) {
      const index = model.blocks.findIndex((b) => b.block_id === nodeId);
      if (index !== -1) {
        model.blocks.splice(index, 1);
        this.updateAndPrint();
        break;
      }
    }
  }

  updateBlockPosition(nodeId: string, position: { x: number; y: number }): void {
    for (const model of Object.values(this.models)) {
      const block = model.blocks.find((b) => b.block_id === nodeId);
      if (block) {
        block.block_position = position;
        this.sortBlocksByVerticalPosition(model);
        this.updateAndPrint();
        break;
      }
    }
  }

  private sortBlocksByVerticalPosition(model: {
    blocks: CanvasBlock[];
  }): void {
    model.blocks.sort((a, b) => {
      const dy = a.block_position.y - b.block_position.y;
      if (dy !== 0) return dy;
      // tie-breaker: left-to-right when y is equal
      return a.block_position.x - b.block_position.x;
    });
  }

  clearAll(): void {
    for (const model of Object.values(this.models)) {
      model.blocks = [];
    }
    this.updateAndPrint();
  }

  private findBlockInCatalog(
    blockName: string,
    catalogData: Catalog | null,
  ): BlockDefinition | null {
    if (!catalogData) {
      return null;
    }

    const normalizedBlockName = this.normalizeBlockName(blockName);

    // Search in blocks
    if (catalogData.blocks) {
      for (const [key, value] of Object.entries(catalogData.blocks)) {
        const normalizedKey = this.normalizeBlockName(key);
        if (normalizedKey === normalizedBlockName) {
          return value;
        }
      }
    }

    return null;
  }

  private normalizeBlockName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private createFallbackBlockDefinition(): BlockDefinition {
    return {
      parameters: [],
      syntax: '',
      description: '',
      shape: '',
    } as BlockDefinition;
  }

  private getCanvasData(): CanvasBlocksData {
    return {
      blocks: this.models,
      timestamp: new Date().toISOString()
    };
  }

  private update(data: CanvasBlocksData): void {
    this.canvasBlocksSubject.next(data);
  }

  private updateAndPrint(): void {
    const data = this.getCanvasData();
    this.update(data);

    console.log('=== Canvas Blocks JSON ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('========================');
    this.logIpcDataFormat();
  }

  private sendIpcDataToServer(ipcData: IIpcDataInterface): void {
    try {
      this.websocketService.send(JSON.stringify(ipcData));
      console.log('=======IpcData sent to server successfully=======');
    } catch (error) {
      console.error('Failed to send ipcData over websocket:', error);
    }
  }

  private extractDefaultParams(params: any[] | undefined): Record<string, any> {
    if (!Array.isArray(params)) return {};

    return params.reduce((acc: Record<string, any>, p: any) => {
      const name = p?.name ?? p?.parameter_name ?? p?.parameterName ?? p?.key;
      if (!name) return acc;

      // Prefer default fields first, then fallback to value
      acc[name] = p?.default ?? p?.default_value ?? p?.value ?? null;
      return acc;
    }, {});
  }

  private getBlockDefaultParameters(blockName: string): Record<string, any> {
    const catalog = this.triggerFlowDataService.getCatalog();
    if (!catalog) return {};

    const normalizedName = blockName.toLowerCase().replace(/\s+/g, ' ').trim();

    // Search in blocks
    if (catalog.blocks) {
      for (const [key, block] of Object.entries(catalog.blocks)) {
        if (key.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedName) {
          return this.extractDefaultParams((block as any)?.parameters);
        }
      }
    }

    // Search in trigger_events
    if (catalog.trigger_events) {
      for (const [key, event] of Object.entries(catalog.trigger_events)) {
        if (key.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedName) {
          return this.extractDefaultParams((event as any)?.parameters);
        }
      }
    }

    return {};
  }

  // BlockParameters uses this
  getBlockById(blockId: string): CanvasBlock | null {
    for (const model of Object.values(this.models)) {
      const block = model.blocks.find((b) => b.block_id === blockId);
      if (block) return block;
    }
    return null;
  }

  logIpcDataFormat(): void {
    const slot_channel_list = this.triggerFlowDataService.getSlotChannelList() || { slots: [] };
    // Build models object, omitting syntax, description, and shape from blocks
    const filteredModels: any = {};

    for (const [modelName, model] of Object.entries(this.models)) {
      filteredModels[modelName] = {
        trigger_model_name: model.trigger_model_name,
        slot_index: model.slot_index,
        blocks: model.blocks.map((block) => {

          return {
            type: block.type,
            block_id: block.block_id,
            block_parameters: this.toParameterMap(block.actual_parameters),
            block_position: block.block_position,
            incoming: block.incoming,
            outgoing: block.outgoing,
            block_error: block.block_error,
          };
        }),
      };
    }

    const triggerFlowState = JSON.stringify({
      models: filteredModels,
      slot_channel_list,
    });

    const ipcData = {
      request_type: 'evaluate_request',
      additional_info: '',
      json_value: triggerFlowState,
    };

    console.log('=== Rust IpcData Format ===');
    console.log(JSON.stringify(ipcData, null, 2));
    console.log('==========================');

    this.sendIpcDataToServer(ipcData);
  }

  getCanvasDataAsJson(): string {
    return JSON.stringify(this.getCanvasData(), null, 2);
  }

  selectBlock(nodeId: string): void {
    this.selectedBlockSubject.next(nodeId);
  }

  clearSelectedBlock(): void {
    this.selectedBlockSubject.next(null);
  }
}
