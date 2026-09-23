import { Injectable, inject } from '@angular/core';
import { ModelSlotOption } from '../main-flow/model-modal/model-modal';
import { TriggerFlowDataService } from './triggerFlowDataService';
import { CanvasBlocksService } from './canvas-blocks.service';
import { ModelResourceAllocationService } from './model-resource-allocation.service';

/**
 * Central source of slot-binding options for model pickers.
 *
 * `validOptions()` returns hardware slots the user can bind a model
 * against: non-Empty modules only, filtered through the per-slot capacity
 * check.
 */
@Injectable({ providedIn: 'root' })
export class SlotBindingHelperService {
  private readonly triggerFlowDataService = inject(TriggerFlowDataService);
  private readonly canvasBlocksService = inject(CanvasBlocksService);
  private readonly modelResourceAllocationService = inject(ModelResourceAllocationService);

  /**
   * Slots with a non-Empty module present in hardware and available
   * capacity. Pass `excludeModelName` when computing options for an
   * existing model (e.g. the Edit Model picker) so the model's own
   * reservations don't disqualify its currently bound slot.
   */
  validOptions(excludeModelName?: string): ModelSlotOption[] {
    const slotChannelList = this.triggerFlowDataService.slotChannelList$();
    if (!slotChannelList) {
      return [];
    }

    const options: ModelSlotOption[] = [];

    for (const slot of slotChannelList.slots ?? []) {
      if (slot.module !== 'Empty') {
        options.push({
          label: `localnode.slot[${slot.slotId}]`,
          displayLabel: `localnode.slot[${slot.slotId}] (${slot.module})`,
          slot: slot.slotId,
          nodeId: 'localnode',
        });
      }
    }

    for (const node of slotChannelList.nodes ?? []) {
      for (const slot of node.slots ?? []) {
        if (slot.module !== 'Empty') {
          options.push({
            label: `${node.nodeId}.slot[${slot.slotId}]`,
            displayLabel: `${node.nodeId}.slot[${slot.slotId}] (${slot.module})`,
            slot: slot.slotId,
            nodeId: node.nodeId,
          });
        }
      }
    }

    // Reading sections() here registers a dependency so callers wrapping
    // this in a computed re-run when models are added or removed.
    this.canvasBlocksService.sections();
    return options.filter((o) =>
      this.modelResourceAllocationService.canCreateNewModelOnSlot(
        o.nodeId,
        o.slot,
        undefined,
        excludeModelName,
      ),
    );
  }
}
