export interface ISlotChannelList {
  slots: ISlot[];
}

export interface ISlot {
  slot_index: number;
  channels: IChannel[];
  module: string;
  node_id: string;
}

export interface IChannel {
  channel_index: number;
  in_use: boolean;
}

export class SlotChannelList {
  slots: Slot[];

  constructor(data: ISlotChannelList) {
    this.slots = data.slots.map((slot) => new Slot(slot));
  }
}

export class Slot {
  slot_index: number;
  channels: Channel[];
  module: string;
  node_id: string;

  constructor(data: ISlot) {
    this.slot_index = data.slot_index;
    this.channels = data.channels.map((channel) => new Channel(channel));
    this.module = data.module;
    this.node_id = data.node_id;
  }
}

export class Channel {
  channel_index: number;
  in_use: boolean;

  constructor(data: IChannel) {
    this.channel_index = data.channel_index;
    this.in_use = data.in_use;
  }
}