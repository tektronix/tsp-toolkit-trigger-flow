import {
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
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
export class TemplateModal implements OnChanges {

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

    const options = this.getModelList();
    const groupCount = this.getTemplateGroups(this.template).length;
    this.selectedModels = Array.from(
      { length: groupCount },
      (_, index) => this.selectedModels[index] || options[index] || options[0] || '',
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue || changes['template']) {
      this.initSelectedModels();
    }
  }

  /** Defaults each template part to a distinct model, one per available index. */
  private initSelectedModels(): void {
    const options = this.getModelList();
    const groupCount = this.getTemplateGroups(this.template).length;
    this.selectedModels = Array.from(
      { length: groupCount },
      (_, index) => options[index] ?? options[0] ?? '',
    );
  }

  /** True when two or more template parts are set to the same model. */
  isDuplicateSelection(groupIndex: number): boolean {
    const value = this.selectedModels[groupIndex];
    if (!value) {
      return false;
    }
    return this.selectedModels.some((model, index) => index !== groupIndex && model === value);
  }

  private hasDuplicateSelections(): boolean {
    return this.selectedModels.some((_, index) => this.isDuplicateSelection(index));
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
    return (
      this.getTemplateGroups(this.template).length === 0 ||
      this.getModelList().length === 0 ||
      this.hasDuplicateSelections()
    );
  }

  get createDisabledReason(): string {
    if (this.getTemplateGroups(this.template).length === 0) {
      return 'No template part sections are available.';
    }
    if (this.hasDuplicateSelections()) {
      return 'Each template part must be assigned a different model.';
    }
    return '';
  }

  onDelete(): void {
    this.cancelled.emit();
  }



}
