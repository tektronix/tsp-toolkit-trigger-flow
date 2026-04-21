import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { ModelModal, ModelModalValue, ModelSlotOption } from './model-modal/model-modal';
import { TriggerFlowDataService } from '../services/triggerFlowDataService';

@Component({
  selector: 'app-main-flow',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    Canvas,
    SidePanelAccordion,
    BlockParameters,
    ModelModal,
  ],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.scss',
})
export class MainFlow {
  @ViewChild(Canvas) private canvas?: Canvas;

  sidebarCollapsed = false;

  showModelModal = false;
  modelName = 'MyTriggerModel';
  modelSlot = 1;
  modelNotes = '';

  slotOptions: ModelSlotOption[] = [];

  constructor(private readonly triggerFlowDataService: TriggerFlowDataService) {}

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  addNewTriggerModel(): void {
    this.loadSlotOptions();
    this.showModelModal = true;
  }

  openScript(): void {
    console.log('Open Script clicked');
  }

  onRequestModelModal(req: {
    suggestedName: string;
    suggestedSlot: number;
    suggestedNode?: number;
    notes: string;
  }): void {
    this.loadSlotOptions();

    this.modelName = req.suggestedName;
    this.modelSlot = req.suggestedSlot;
    this.modelNotes = req.notes;

    if (!this.slotOptions.some((o) => o.slot === this.modelSlot) && this.slotOptions.length > 0) {
      this.modelSlot = this.slotOptions[0].slot;
    }

    this.showModelModal = true;
  }

  // Kept for future dependent dropdown logic.
  onModelModalSlotChanged(slot: number): void {
    this.modelSlot = slot;
  }

  onModelModalClose(value: ModelModalValue): void {
    this.modelName = value.name;
    this.modelSlot = value.slot;
    this.modelNotes = value.notes;

    this.canvas?.createModelAndContinue(value);
    this.showModelModal = false;
  }

  // Trash action from modal:
  // Cancels pending block creation in Canvas.
  onModelModalDelete(): void {
    this.canvas?.discardPendingCreateNode();
    this.showModelModal = false;
  }

  // Copy modal data to clipboard when copy icon_ i_is clicked.
  async onModelModalCopy(): Promise<void> {
    const text = [`Name: ${this.modelName}`, `Slot: ${this.modelSlot}`, `Notes: ${this.modelNotes}`].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      console.log('Model modal data copied to clipboard.');
    } catch {
      console.warn('Clipboard copy failed.');
    }
  }

  private loadSlotOptions(): void {
    const slotChannelList = this.triggerFlowDataService.getSlotChannelList();

    if (!slotChannelList) {
      this.slotOptions = [];
      return;
    }

    const options: ModelSlotOption[] = [];

    // localnode slots
    for (const slot of slotChannelList.slots ?? []) {
      if (slot.module !== 'Empty') {
        options.push({
          label: `localnode.slot[${slot.slotId}]`,
          slot: slot.slotId,
        });
      }
    }

    // child node slots (derive display index from nodeId)
    for (const node of slotChannelList.nodes ?? []) {
      // Example: "node2" -> 2, "N3" -> 3, fallback to original nodeId label
      const parsedNodeIndex = Number.parseInt(String(node.nodeId).replace(/\D/g, ''), 10);
      const nodeLabel =
        Number.isFinite(parsedNodeIndex) && parsedNodeIndex > 0
          ? `node${parsedNodeIndex}`
          : `node.${node.nodeId}`;

      for (const slot of node.slots ?? []) {
        if (slot.module !== 'Empty') {
          options.push({
            label: `${nodeLabel}.slot[${slot.slotId}]`,
            slot: slot.slotId,
          });
        }
      }
    }

    this.slotOptions = options;

    if (this.slotOptions.length > 0 && !this.slotOptions.some((o) => o.slot === this.modelSlot)) {
      this.modelSlot = this.slotOptions[0].slot;
    }
  }
}
