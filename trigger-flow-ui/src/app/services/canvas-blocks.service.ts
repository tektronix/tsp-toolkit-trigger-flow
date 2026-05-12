import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { Catalog, BlockDefinition, ActualParameter } from '../models/triggerBlock';
import { BlockErrorEntry, JsonValue, TriggerModel } from '../models/triggerFlowState';
import { Websocket } from './websocket';
import { TriggerFlowDataService } from './triggerFlowDataService';
import { FlowNode, FlowSection, FlowConnection } from '../main-flow/canvas/canvas';
import { PaletteDataService } from './palette-data.service';

export interface CanvasBlock {
  block_id: string;
  type: string;
  blockData: BlockDefinition;
  block_position: { x: number; y: number };
  incoming: string | null;
  outgoing: string | null;
  block_error: BlockErrorEntry[] | null;
  actual_parameters: ActualParameter[]; // To store actual values
  notes: string;
}

declare const acquireVsCodeApi: unknown;
 
export const vscode =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: () => { } };

export interface CanvasBlocksData {
  blocks: Record<string, { trigger_model_name: string; slot_index: number; blocks: CanvasBlock[] }>;
  timestamp: string;
}

@Injectable({
  providedIn: 'root',
})
export class CanvasBlocksService {
  private triggerFlowDataService = inject(TriggerFlowDataService);
  private websocketService = inject(Websocket);
  private paletteDataService = inject(PaletteDataService);
  // public, readable signal
  readonly sections = signal<FlowSection[]>([]);
   // public, readable signal
  readonly connections = signal<FlowConnection[]>([]);

  private canvasBlocksSubject = new BehaviorSubject<CanvasBlocksData>(this.getCanvasData());
  public canvasBlocks$ = this.canvasBlocksSubject.asObservable();

  // Support multiple models per canvas
  private models: Record<
    string,
    {
      trigger_model_name: string;
      slot_index: number;
      node_id: string;
      blocks: CanvasBlock[];
    }
  > = {};
  private selectedBlockSubject = new BehaviorSubject<string | null>(null);
  public selectedBlock$ = this.selectedBlockSubject.asObservable();

  private connectionRequestSubject = new Subject<{ sourceBlockId: string; targetBlockId: string }>();
  public connectionRequest$ = this.connectionRequestSubject.asObservable();

  /**
   * Request that the canvas render a connection from `sourceBlockId`'s output
   * to `targetBlockId`'s input. Listeners (e.g. canvas component) subscribe to
   * `connectionRequest$` to add the FlowConnection to their signal.
   */
  requestConnection(sourceBlockId: string, targetBlockId: string): void {
    if (!sourceBlockId || !targetBlockId) return;
    this.connectionRequestSubject.next({ sourceBlockId, targetBlockId });
  }

  private toParameterMap(params: ActualParameter[]): Record<string, unknown> {
    return params.reduce((acc, param) => {
      acc[param.name] = param.value ?? param.default ?? null;
      return acc;
    }, {} as Record<string, unknown>);
  }

  loadSessionData(models: Record<string, TriggerModel>): void {
    // Wipe previous session visual state so recall doesn't duplicate.
    this.sections.set([]);
    this.connections.set([]);

    // `setBlockData` is the single source of truth for `this.models` —
    // it builds full CanvasBlock objects (with parameter values overlaid)
    // and falls back to an empty block definition when the catalog is
    // missing, so restoration never silently drops blocks.
    this.setBlockData(models);

    // Build sections from the now-populated `this.models` so we don't
    // depend on `addBlock` (which bails out on catalog misses).
    this.sections.set(this.buildSectionsFromModels());

    this.restoreConnections();
  }

  /**
   * Derives FlowSection[] from the current `this.models` map. Each model
   * becomes a section with one FlowNode per CanvasBlock.
   */
  private buildSectionsFromModels(): FlowSection[] {
    return Object.entries(this.models).map(([modelName, model], index) => {
      const sectionId = `group-${index + 1}`;
      return {
        id: sectionId,
        modelName: model.trigger_model_name || modelName,
        slotIndex: model.slot_index ?? 0,
        nodeId: model.node_id,
        nodes: model.blocks.map((block, blockIdx) => {
          const blockType = block.type;
          return {
            blockId: block.block_id,
            sectionId,
            position: block.block_position ?? { x: 100 + blockIdx * 150, y: 100 },
            blockType,
            catalogLabel: blockType,
            svgPath: this.getSVGPath(blockType),
            input: `input-${block.block_id}`,
            outputs: [`output-${block.block_id}`],
            color: '#FFFFFF',
          } as FlowNode;
        }),
      };
    });
  }

   private createFallbackBlockDefinition(): BlockDefinition {
    return {
      parameters: [],
      syntax: '',
      description: '',
      shape: '',
    } as BlockDefinition;
  }

   private update(data: CanvasBlocksData): void {
      this.canvasBlocksSubject.next(data);
    }

  /**
     * Set the data for the trigger model of this canvas
     * @param models The list of models to set the local model to.
     */
    setBlockData(models: Record<string, TriggerModel>): void {
      console.log('setBlockData:', models);

      // Reset so recall replaces (not merges with) any previous session.
      this.models = {};

      const nextModels: Record<
        string,
        {
          trigger_model_name: string;
          node_id: string;
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
                const paramValue = item.block_parameters[param.name];
                if (paramValue !== null && paramValue !== undefined) {
                  actual.value = paramValue as any;
                }
                return actual;
              }),
              notes: '',
            };
            return canvasBlock;
          })
          .filter((item): item is CanvasBlock => item !== null);

        nextModels[name] = {
          trigger_model_name: model.trigger_model_name,
          slot_index: model.slot_index,
          node_id: model.node_id,
          blocks,
        };
      }

      this.models = nextModels;
      this.update(this.getCanvasData());
    }
  

  restoreConnections(): void {
    // Walk every restored block and rebuild FlowConnections from the
    // *_block_name parameters that reference another block's
    // `trigger_block_name`.
    const linkParamNames = [
      'branch_to_block_name',
      'reference_block_name',
      'reset_branch_count_block_name',
    ];

    const restored: FlowConnection[] = [];
    const seen = new Set<string>();
    let counter = 0;

    for (const model of Object.values(this.models)) {
      for (const targetBlock of model.blocks) {
        for (const param of targetBlock.actual_parameters) {
          if (!linkParamNames.includes(param.name)) continue;
          if (param.value == null || param.value === '') continue;

          const sourceName = String(param.value);
          const sourceBlock = this.findBlockByName(sourceName);
          if (!sourceBlock) continue;

          const fOutputId = `${sourceBlock.block_id}-out-right`;
          const fInputId = `${targetBlock.block_id}-in`;
          const dedupeKey = `${fOutputId}->${fInputId}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          restored.push({
            id: `connection-restored-${++counter}`,
            fOutputId,
            fInputId,
          });
        }
      }
    }

    this.connections.set(restored);
  }

  private getSVGPath(blockType: string): string {
    const svgPath = this.paletteDataService.getSVGPathByCatalogLabel(blockType);
    return this.changeSVGPath(svgPath || '');
  }
  changeSVGPath(svgPath: string): string {
    return svgPath.replace('palette/', 'canvas/');
  }


  addBlock(
    blockId: string,
    blockLabel: string,
    position: { x: number; y: number },
    modelName: string,
    slotIndex: number,
    nodeId: string,
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
        node_id: nodeId,
        blocks: [],
      };
    }

    // Initialize ActualParameter[] from blockData.parameters
    const actualParameters: ActualParameter[] = blockData.parameters.map(
      (param) => new ActualParameter(param),
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
      notes: '',
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
        // Capture the deleted block's `trigger_block_name` before removal so
        // we can null out references to it on remaining blocks.
        const deletedBlock = model.blocks[index];
        const triggerNameParam = deletedBlock.actual_parameters.find(
          (p) => p.name === 'trigger_block_name',
        );
        const removedBlockName =
          triggerNameParam?.value != null ? String(triggerNameParam.value) : null;

        model.blocks.splice(index, 1);

        // update parameters of remaining blocks to remove any connections to the deleted block
        if (removedBlockName) {
          for (const block of model.blocks) {
            for (const param of block.actual_parameters) {
              if (param.name === 'branch_to_block_name' || param.name === 'reference_block_name' || param.name === 'reset_branch_count_block_name') {
                if (param.value === removedBlockName) {
                  param.value = null;
                }
              }
            }
          }
        }
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

  private sortBlocksByVerticalPosition(model: { blocks: CanvasBlock[] }): void {
    model.blocks.sort((a, b) => {
      const dy = a.block_position.y - b.block_position.y;
      if (dy !== 0) return dy;
      // tie-breaker: left-to-right when y is equal
      return a.block_position.x - b.block_position.x;
    });
  }

  getModels() {
    return this.models;
  }

  // updateBlockParameters(nodeId: string, parameters: Record<string, any>): void {
  //   for (const model of Object.values(this.models)) {
  //     const block = model.blocks.find((b) => b.block_id === nodeId);
  //     if (block) {
  //       block.block_parameters = parameters;
  //       this.updateAndPrint();
  //       break;
  //     }
  //   }
  // }

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

    const normalizedBlockName = blockName.toLowerCase().replace(/\s+/g, ' ').trim();

    // Search in blocks
    if (catalogData.blocks) {
      for (const [key, value] of Object.entries(catalogData.blocks)) {
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
      blocks: this.models,
      timestamp: new Date().toISOString(),
    };
  }

  updateAndPrint(): void {
    const data = this.getCanvasData();
    this.update(data);

    console.log('=== Canvas Blocks JSON ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('========================');
    this.logIpcDataFormat();
  }

  private sendIpcDataToServer(ipcData: { request_type: string; additional_info: string; json_value: string }): void {
    try {
      this.websocketService.send(JSON.stringify(ipcData));
      console.log('=======IpcData sent to server successfully=======');
    } catch (error) {
      console.error('Failed to send ipcData over websocket:', error);
    }
  }

  // private extractDefaultParams(params: any[] | undefined): Record<string, any> {
  //   if (!Array.isArray(params)) return {};

  //   return params.reduce((acc: Record<string, any>, p: any) => {
  //     const name = p?.name ?? p?.parameter_name ?? p?.parameterName ?? p?.key;
  //     if (!name) return acc;

  //     // Prefer default fields first, then fallback to value
  //     acc[name] = p?.default ?? p?.default_value ?? p?.value ?? null;
  //     return acc;
  //   }, {});
  // }

  // private getBlockDefaultParameters(blockName: string): Record<string, any> {
  //   const catalog = this.triggerFlowDataService.getCatalog();
  //   if (!catalog) return {};

  //   const normalizedName = blockName.toLowerCase().replace(/\s+/g, ' ').trim();

  //   // Search in blocks
  //   if (catalog.blocks) {
  //     for (const [key, block] of Object.entries(catalog.blocks)) {
  //       if (key.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedName) {
  //         return this.extractDefaultParams((block as any)?.parameters);
  //       }
  //     }
  //   }

  //   // Search in trigger_events
  //   if (catalog.trigger_events) {
  //     for (const [key, event] of Object.entries(catalog.trigger_events)) {
  //       if (key.toLowerCase().replace(/\s+/g, ' ').trim() === normalizedName) {
  //         return this.extractDefaultParams((event as any)?.parameters);
  //       }
  //     }
  //   }

  //   return {};
  // }


  private toBlockParameters(actualParameters: ActualParameter[]): Record<string, JsonValue> {
    return actualParameters.reduce((acc: Record<string, JsonValue>, param) => {
      const value = param.value ?? param.default ?? null;
      acc[param.name] = value as JsonValue;
      return acc;
    }, {});
  }

  // BlockParameters uses this
  getBlockById(blockId: string): CanvasBlock | null {
    for (const model of Object.values(this.models)) {
      const block = model.blocks.find((b) => b.block_id === blockId);
      if (block) return block;
    }
    return null;
  }

  getModelForBlock(blockId: string): {
    trigger_model_name: string;
    slot_index: number;
    node_id: string;
    blocks: CanvasBlock[];
  } | null {
    for (const model of Object.values(this.models)) {
      const exists = model.blocks.some((block) => block.block_id === blockId);

      if (exists) {
        return model;
      }
    }

    return null;
  }

  /**
   * Finds a block whose `trigger_block_name` actual parameter value matches
   * the given name. Searches across all models. Returns null when not found.
   */
  findBlockByName(name: string): CanvasBlock | null {
    if (!name) return null;
    for (const model of Object.values(this.models)) {
      const block = model.blocks.find((b) => {
        const param = b.actual_parameters.find(
          (p) => p.name === 'trigger_block_name',
        );
        return param?.value != null && String(param.value) === name;
      });
      if (block) return block;
    }
    return null;
  }

  /**
   * Updates the `value` of an actual parameter on a block. Returns true if a
   * matching parameter was found and updated.
   */
  updateBlockParameterValue(
    blockId: string,
    parameterName: string,
    value: string | number | null,
  ): boolean {
    const block = this.getBlockById(blockId);
    if (!block) return false;
    const param = block.actual_parameters.find((p) => p.name === parameterName);
    if (!param) return false;
    param.value = value;
    this.updateAndPrint();
    return true;
  }

  logIpcDataFormat(): void {
    const slot_channel_list = this.triggerFlowDataService.getSlotChannelList() || { slots: [] };
    // Build models object, omitting syntax, description, and shape from blocks
    const filteredModels: Record<string, { trigger_model_name: string; slot_index: number; node_id: string; blocks: Record<string, unknown>[] }> = {};

    for (const [modelName, model] of Object.entries(this.models)) {
      filteredModels[modelName] = {
        trigger_model_name: model.trigger_model_name,
        slot_index: model.slot_index,
        node_id: model.node_id,
        blocks: model.blocks.map((block) => {
          return {
            type: block.type,
            block_id: block.block_id,
            block_parameters: this.toBlockParameters(block.actual_parameters),
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
