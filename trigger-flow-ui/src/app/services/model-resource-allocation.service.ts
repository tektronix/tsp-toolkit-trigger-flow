import { Injectable, inject } from '@angular/core';
import { CanvasBlocksService } from './canvas-blocks.service';
import { TriggerFlowDataService } from './triggerFlowDataService';
import { Module, Slot, SlotChannelList } from '../models/slotChannelModel';
import { CheckboxOption } from '../custom-controls/checkbox-group/checkbox-group';

@Injectable({ providedIn: 'root' })
export class ModelResourceAllocationService {
  private canvasBlocksService = inject(CanvasBlocksService);
  private triggerFlowDataService = inject(TriggerFlowDataService);

  /**
   * Returns channel options for a given block.
   * - All channels of the block's model's slot are listed.
   * - Channels already used by OTHER models on the same slot+node are disabled,
   *   so the user can see them but cannot select them in this block.
   */
  getChannelOptionsForBlock(blockId: string): CheckboxOption[] {
    const models = this.canvasBlocksService.getModels();
    const slotChannelList = this.triggerFlowDataService.getSlotChannelList();
    if (!slotChannelList) {
      return [];
    }

    // Find the model owning this block
    const ownerEntry = Object.entries(models).find(([, m]) =>
      m.blocks.some((b) => b.block_id === blockId),
    );
    if (!ownerEntry) {
      return [];
    }

    const [ownerName, ownerModel] = ownerEntry;

    const slot = this.findSlot(ownerModel.slot_index, ownerModel.node_id, slotChannelList);
    if (!slot) {
      return [];
    }

    // Collect channels already used by OTHER models on the same slot+node
    const usedByOthers = new Set<string>();
    for (const [name, model] of Object.entries(models)) {
      if (name === ownerName) continue;
      if (model.slot_index !== ownerModel.slot_index) continue;
      if (model.node_id !== ownerModel.node_id) continue;

      for (const block of model.blocks) {
        for (const param of block.actual_parameters) {
          if (param.name === 'channel_list' && Array.isArray(param.value)) {
            param.value.forEach((ch) => usedByOthers.add(`${ch}`));
          }
        }
      }
    }

    return slot.channels.map((ch) => {
      const value = `${ch.channelIndex}`;
      return {
        value,
        label: `Channel ${value}`,
        disabled: usedByOthers.has(value),
      };
    });
  }

  private findSlot(slotId: number, nodeId: string, list: SlotChannelList): Slot | null {
    if (nodeId === 'localnode') {
      return list.slots.find((s) => s.slotId === slotId) ?? null;
    }
    const node = list.nodes.find((n) => n.nodeId === nodeId);
    return node?.slots?.find((s) => s.slotId === slotId) ?? null;
  }

  /**
   * Returns the module installed in the slot that owns the given block,
   * or null if the block / slot cannot be resolved.
   */
  getModuleForBlock(blockId: string): Module | null {
    const slotChannelList = this.triggerFlowDataService.getSlotChannelList();
    if (!slotChannelList) {
      return null;
    }

    const ownerModel = Object.values(this.canvasBlocksService.getModels()).find((m) =>
      m.blocks.some((b) => b.block_id === blockId),
    );
    if (!ownerModel) {
      return null;
    }

    return this.findSlot(ownerModel.slot_index, ownerModel.node_id, slotChannelList)?.module ?? null;
  }

  /**
   * Returns all installed (non-Empty) slots on the node that owns the given
   * block. Used by event parameter dropdowns where the user may target any
   * slot on the same node, independent of the block's own slot.
   */
  getNodeSlotsForBlock(blockId: string): Slot[] {
    const slotChannelList = this.triggerFlowDataService.getSlotChannelList();
    if (!slotChannelList) {
      return [];
    }

    const ownerModel = Object.values(this.canvasBlocksService.getModels()).find((m) =>
      m.blocks.some((b) => b.block_id === blockId),
    );
    if (!ownerModel) {
      return [];
    }

    const slots =
      ownerModel.node_id === 'localnode'
        ? slotChannelList.slots
        : (slotChannelList.nodes.find((n) => n.nodeId === ownerModel.node_id)?.slots ?? []);

    return slots.filter((slot) => slot.module !== 'Empty');
  }

  /**
   * Returns the module installed in a specific slot on the same node as the
   * given block. Useful for event parameters whose constraint branch
   * (SMU/PSU) depends on the slot the user picked inside the event UI,
   * which may differ from the block's own slot.
   */
  getModuleForNodeSlot(blockId: string, slotId: number | string): Module | null {
    const slot = this.getNodeSlotsForBlock(blockId).find(
      (candidate) => `${candidate.slotId}` === `${slotId}`,
    );
    return slot?.module ?? null;
  }
}
