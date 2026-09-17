import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

import { Dropdown } from '../../custom-controls/dropdown/dropdown';
import { TemplateInstantiationService } from '../../services/template-instantiation.service';
import { CanvasBlocksService } from '../../services/canvas-blocks.service';
import { ITemplate } from '../../models/triggerBlock';

export interface TemplateModalValue {
  templateName: string;
  modelGroup1: string;
  modelGroup2: string;
}

@Component({
  selector: 'app-template-modal',
  imports: [Dropdown],
  templateUrl: './template-modal.html',
  styleUrls: ['./template-modal.scss'],
})
export class TemplateModal {

  @Input() open = false;
  @Input() template: ITemplate | null = null;
  @Output() confirmed = new EventEmitter<string[]>();
  @Output() cancelled = new EventEmitter<void>();
  /** Emits the group index that needs a brand new model. */
  @Output() addModel = new EventEmitter<number>();

  selectedModels: string[] = [];

  private templateInstantiationService: TemplateInstantiationService = inject(TemplateInstantiationService);
  private canvasBlocksService: CanvasBlocksService = inject(CanvasBlocksService);



  getTemplateGroups(template: ITemplate | null) {
    return template ? this.templateInstantiationService.getTemplateGroups(template) : [];
  }

  getModelList() {
    return this.canvasBlocksService.sections().map((section) => section.modelName);
  }

  onModelSelectionChanged(groupIndex: number, modelName: string): void {
    this.selectedModels[groupIndex] = modelName;
  }

  /** Called by the parent once a model created from this modal is on the canvas. */
  setGroupSelection(groupIndex: number, modelName: string): void {
    this.selectedModels[groupIndex] = modelName;
  }

  onCreate(): void {
    const options = this.getModelList();
    const groupCount = this.getTemplateGroups(this.template).length;
    const selections = Array.from(
      { length: groupCount },
      (_, index) => this.selectedModels[index] ?? options[0] ?? '',
    );
    this.confirmed.emit(selections);
  }

  onModalKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.onDelete();
    }
  }

  get disableCreate(): boolean {
    return this.getTemplateGroups(this.template).length === 0 || this.getModelList().length === 0;
  }

  get createDisabledReason(): string {
    return this.disableCreate ? 'No template part sections are available.' : '';
  }

  onDelete(): void {
    this.cancelled.emit();
  }



}
