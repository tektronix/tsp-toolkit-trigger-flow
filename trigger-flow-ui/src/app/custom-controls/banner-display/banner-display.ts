import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusMsg } from '../../models/statusMsg';
import { StatusService } from '../../services/status-msg.service';

@Component({
  selector: 'app-banner-display',
  imports: [CommonModule],
  templateUrl: './banner-display.html',
  styleUrls: ['./banner-display.scss'],
})
export class BannerDisplay {
  private readonly statusService = inject(StatusService);
  private readonly _external = signal<StatusMsg | undefined>(undefined);

  // External input wins over the service-driven status when both are set.
  private readonly _displayed = computed<StatusMsg | undefined>(
    () => this._external() ?? this.statusService.status(),
  );

  @Input()
  get statusMsg(): StatusMsg | undefined {
    return this._displayed();
  }

  set statusMsg(value: StatusMsg | undefined) {
    this._external.set(value);
  }

  clearServiceMessage(): void {
    this.statusService.clear();
  }
}
