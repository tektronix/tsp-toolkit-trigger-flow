export type Module = "MPSU50_2ST" | "MSMU60_2" | "MSMU200_2" | "Empty";

export interface ISlotChannelList {
  localnode: string;
  slots: ISlot[];
  nodes: INode[];
}

export interface ISlot {
  slotId: number;
  module: Module;
  channels: IChannel[];
}

export interface INode {
  nodeId: string;
  mainframe: string;
  slots?: ISlot[] | null;
}

export interface IChannel {
  channelIndex: number;
  inUse: boolean;
}

export class SlotChannelList {
  localnode: string;
  slots: Slot[];
  nodes: Node[];

  constructor(data: ISlotChannelList) {
    this.localnode = data.localnode;
    this.slots = data.slots.map((slot) => new Slot(slot));
    this.nodes = data.nodes.map((node) => new Node(node));
  }
}

export class Slot {
  slotId: number;
  channels: Channel[];
  module: Module;

  constructor(data: ISlot) {
    this.slotId = data.slotId;
    this.channels = data.channels.map((channel) => new Channel(channel));
    this.module = data.module;
  }
}

export class Node {
  nodeId: string;
  mainframe: string;
  slots: Slot[] | null;

  constructor(data: INode) {
    this.nodeId = data.nodeId;
    this.mainframe = data.mainframe;
    this.slots = data.slots
      ? data.slots.map((slot) => new Slot(slot))
      : null;
  }
}

export class Channel {
  channelIndex: number;
  inUse: boolean;

  constructor(data: IChannel) {
    this.channelIndex = data.channelIndex;
    this.inUse = data.inUse;
  }
}
