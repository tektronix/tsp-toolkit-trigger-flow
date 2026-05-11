import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { ModelModal, ModelModalValue, ModelSlotOption } from './model-modal/model-modal';
import { TriggerFlowDataService } from '../services/triggerFlowDataService';
import { vscode } from '../services/canvas-blocks.service';
import {
  ModelSettingsModal,
  ModelSettingsItem,
} from './model-settings-modal/model-settings-modal';

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
    ModelSettingsModal,
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
  modelNodeId = '';
  modelNotes = '';

  showModelSettingsModal = false;

  modelSettingsList: ModelSettingsItem[] = [];

  slotOptions: ModelSlotOption[] = [];

  private readonly triggerFlowDataService = inject(TriggerFlowDataService);

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  addNewTriggerModel(): void {
    this.loadSlotOptions();
    this.showModelModal = true;
  }

  openScript(): void {
    console.log('Open Script clicked');
    vscode.postMessage({ command: 'open_script' });
  }

  onRequestModelModal(req: { suggestedName: string; suggestedSlot: number; notes: string }): void {
    this.loadSlotOptions();

    this.modelName = req.suggestedName;
    this.modelNotes = req.notes;

    this.showModelModal = true;
  }

  // Kept for future dependent dropdown logic.
  onModelModalSlotChanged(selectedSlot: ModelSlotOption): void {
    this.modelSlot = selectedSlot.slot;
    this.modelNodeId = selectedSlot.nodeId;
  }

  onModelModalClose(value: ModelModalValue): void {
    this.modelName = value.name;
    this.modelSlot = value.slot;
    this.modelNodeId = value.nodeId;
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
    const text = [
      `Name: ${this.modelName}`,
      `Slot: ${this.modelSlot}`,
      `Notes: ${this.modelNotes}`,
    ].join('\n');

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
          nodeId: 'localnode',
        });
      }
    }

    // child node slots (derive display index from nodeId)
    for (const node of slotChannelList.nodes ?? []) {
      // // Example: "node2" -> 2, "N3" -> 3, fallback to original nodeId label
      // const parsedNodeIndex = Number.parseInt(String(node.nodeId).replace(/\D/g, ''), 10);
      // const nodeLabel =
      //   Number.isFinite(parsedNodeIndex) && parsedNodeIndex > 0
      //     ? `node${parsedNodeIndex}`
      //     : `node.${node.nodeId}`;

      for (const slot of node.slots ?? []) {
        if (slot.module !== 'Empty') {
          options.push({
            label: `${node.nodeId}.slot[${slot.slotId}]`,
            slot: slot.slotId,
            nodeId: node.nodeId,
          });
        }
      }
    }

    this.slotOptions = options;

    // Always pick the first available slot from slotOptions; suggestedSlot is
    // just a number and has no direct relevance to slotChannelList.
    const first = this.slotOptions[0];
    this.modelSlot = first?.slot ?? 1;
    this.modelNodeId = first?.nodeId ?? '';
  }

  openModelSettings(): void {
    const sections = this.canvas?.getSections() ?? [];

    this.modelSettingsList = sections.map((section) => ({
      id: section.id,
      modelName: section.modelName,
      nodeId: section.nodeId,
      slotIndex: section.slotIndex,
    }));

    this.showModelSettingsModal = true;
  }

  closeModelSettings(): void {
    this.showModelSettingsModal = false;
  }

  onAddModelFromSettings(): void {
    this.showModelSettingsModal = false;

    this.addNewTriggerModel();
  }

  async onCopyModel(item: ModelSettingsItem): Promise<void> {
    const text = [
      `Model: ${item.modelName}`,
      `Node: ${item.nodeId}`,
      `Slot: ${item.slotIndex}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('Copy failed');
    }
  }

  onDeleteModel(item: ModelSettingsItem): void {
    console.log('Delete model:', item);
  }

  onEditModel(item: ModelSettingsItem): void {
    console.log('Edit model:', item);
  }
  
}
