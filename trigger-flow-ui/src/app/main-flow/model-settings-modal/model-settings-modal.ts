import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';

export interface ModelSettingsItem {
  id: string;
  modelName: string;
  nodeId: string;
  slotIndex: number;
}

@Component({
  selector: 'app-model-settings-modal',
  standalone: true,
  imports: [CommonModule, AngularSvgIconModule],
  templateUrl: './model-settings-modal.html',
  styleUrl: './model-settings-modal.scss',
})
export class ModelSettingsModal {
  @Input() open = false;

  @Input() models: ModelSettingsItem[] = [];

  @Input() usedChannels = 0;

  @Input() totalChannels = 0;

  @Input() canAddModel = false;

  get isAddDisabled(): boolean { return !this.canAddModel; }

  @Output() close = new EventEmitter<void>();

  @Output() addModel = new EventEmitter<void>();

  @Output() editModel = new EventEmitter<ModelSettingsItem>();

  @Output() deleteModel = new EventEmitter<ModelSettingsItem>();
}
