import { Optional } from "@angular/core";
import { ISlotChannelList, SlotChannelList } from "./slotChannelModel";
import { Catalog, ICatalog } from "./triggerBlock";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ITriggerFlowStatePayload {
  catalog?: Catalog;
  slot_channel_list: ISlotChannelList;
  models: Record<string, ITriggerModel>;
}

export interface ITriggerModel {
  trigger_model_name: string;
  slot_index: number;
  node_id: string;
  blocks: ITriggerModelBlock[];
}

export interface ITriggerModelBlock {
  block_id: string;
  type: string;
  block_parameters: Record<string, JsonValue>;
  incoming?: string | null;
  outgoing?: string | null;
  block_position: IBlockPosition;
  block_error?: BlockErrorEntry[] | null;
}

export interface IBlockPosition {
  x: number;
  y: number;
}

export type BlockErrorEntry = [boolean, string];

export class TriggerFlowStatePayload {
  slot_channel_list: SlotChannelList;
  models: Record<string, TriggerModel> = {};
  catalog?: Catalog| null;

  constructor(data: ITriggerFlowStatePayload) {
    this.slot_channel_list = new SlotChannelList(data.slot_channel_list);
    try {
      this.catalog = data.catalog ? new Catalog(data.catalog) : null;
      console.log('###TriggerFlowStatePayload: catalog constructed =', !!this.catalog);
    } catch (e) {
      console.error('###TriggerFlowStatePayload: Catalog construction FAILED', e, 'raw=', data.catalog);
      this.catalog = null;
    }
    for (const modelName of Object.keys(data.models)) {
      this.models[modelName] = new TriggerModel(data.models[modelName]);
    }
  }
}

export class TriggerModel {
  trigger_model_name: string;
  slot_index: number;
  node_id: string;
  blocks: TriggerModelBlock[];

  constructor(data: ITriggerModel) {
    this.trigger_model_name = data.trigger_model_name;
    this.slot_index = data.slot_index;
    this.node_id = data.node_id;
    this.blocks = data.blocks.map(
      (block: ITriggerModelBlock) => new TriggerModelBlock(block)
    );
  }
}

export class TriggerModelBlock {
  block_id: string;
  type: string;
  block_parameters: Record<string, JsonValue>;
  incoming: string | null;
  outgoing: string | null;
  block_position: BlockPosition;
  block_error: BlockErrorEntry[] | null;

  constructor(data: ITriggerModelBlock) {
    this.block_id = data.block_id;
    this.type = data.type;
    this.block_parameters = data.block_parameters;
    this.incoming = data.incoming ?? null;
    this.outgoing = data.outgoing ?? null;
    this.block_position = new BlockPosition(data.block_position);
    this.block_error = data.block_error ?? null;
  }
}

export class BlockPosition {
  x: number;
  y: number;

  constructor(data: IBlockPosition) {
    this.x = data.x;
    this.y = data.y;
  }
}