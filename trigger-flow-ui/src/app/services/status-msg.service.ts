import { Injectable, Signal, signal } from '@angular/core';
import { StatusMsg } from '../models/statusMsg';
@Injectable({
    providedIn: 'root',
})
export class StatusService {
    private readonly _status = signal<StatusMsg | undefined>(undefined);
    readonly status: Signal<StatusMsg | undefined> = this._status.asReadonly();

    show(msg: StatusMsg, timeout = 5000): void {
        this._status.set(msg);
        if (timeout > 0) {
            setTimeout(() => {
                if (this._status() === msg) {
                    this.clear();
                }
            }, timeout);
        }
    }

    clear(): void {
        this._status.set(undefined);
    }
}
