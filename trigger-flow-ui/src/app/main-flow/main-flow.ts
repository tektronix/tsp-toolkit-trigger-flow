import { Component, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { ModelModal, ModelModalValue } from './model-modal/model-modal';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-main-flow',
  imports: [CommonModule, FormsModule, Canvas, SidePanelAccordion, BlockParameters, ModelModal, MatIconModule],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.scss',
})
export class MainFlow {
  @ViewChild(Canvas) private canvas?: Canvas;

  sidebarCollapsed = false;

  showModelModal = false;
  modelName = 'MyTriggerModel';
  modelSlot = 1;
  modelNode = 1;
  modelNotes = '';
  slotOptions = [1, 2, 3, 4];
  nodeOptions = [1, 2, 3, 4];

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  // Called by Canvas when first block is dropped and no model exists
  onRequestModelModal(req: { suggestedName: string; suggestedSlot: number; suggestedNode: number; notes: string }): void {
    this.modelName = req.suggestedName;
    this.modelSlot = req.suggestedSlot;
    this.modelNode = req.suggestedNode;
    this.modelNotes = req.notes;
    this.showModelModal = true;
  }

  // Close (X) action from modal:
  // Creates model in Canvas and continues pending block creation.
  onModelModalClose(value: ModelModalValue): void {
    this.canvas?.createModelAndContinue(value);
    this.showModelModal = false;
  }

  // Trash action from modal:
  // Cancels pending block creation in Canvas.
  onModelModalDelete(): void {
    this.canvas?.discardPendingCreateNode();
    this.showModelModal = false;
  }

  addNewTriggerModel(): void {
    console.log('Model Settings clicked');
    // this.showModelModal = true;
  }

  openScript(): void {
    console.log('Open Script clicked');
  }

  saveModelModal(): void {
    this.onModelModalClose({
      name: this.modelName,
      slot: this.modelSlot,
      node: this.modelNode,
      notes: this.modelNotes,
    });
  }

  cancelModelModal(): void {
    this.onModelModalDelete();
  }

  // Copy modal data to clipboard when copy icon is clicked.
  async onModelModalCopy(): Promise<void> {
    const text = [
      `Name: ${this.modelName ?? ''}`,
      `Slot: ${this.modelSlot ?? ''}`,
      `Node: ${this.modelNode ?? ''}`,
      `Notes: ${this.modelNotes ?? ''}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      console.log('Model modal data copied to clipboard.');
    } catch {
      console.warn('Clipboard copy failed.');
    }
  }
}
