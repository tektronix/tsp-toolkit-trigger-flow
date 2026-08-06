import { Component, OnDestroy, OnInit, computed, effect, signal, inject } from '@angular/core';
import { MainFlow } from './main-flow/main-flow';
import { Websocket } from './services/websocket';
import { Subscription } from 'rxjs';
import { IpcData } from './models/ipcData';
import { TriggerFlowDataService } from './services/triggerFlowDataService';
import { TriggerFlowStatePayload } from './models/triggerFlowState';
import { vscode } from './services/canvas-blocks.service';
import { DEBUG } from './debug';

@Component({
  selector: 'app-root',
  imports: [MainFlow],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('trigger-flow-ui');

  private webSocket = inject(Websocket);
  private triggerFlowDataService = inject(TriggerFlowDataService);
  private wsSubscription: Subscription | undefined;

  protected readonly slotChannelList$ = this.triggerFlowDataService.slotChannelList$;

  /**
   * True when at least one non-Empty slot exists on localnode or any
   * TSP-Link node. Mirrors Rust's `is_valid_config` non-empty-slot arm
   * without the mainframe check, which is not needed on the UI.
   */
  private readonly hasValidHardware = computed<boolean>(() => {
    const list = this.triggerFlowDataService.slotChannelList$();
    if (!list) return false;
    const local = (list.slots ?? []).some((s) => s.module !== 'Empty');
    if (local) return true;
    return (list.nodes ?? []).some((n) =>
      (n.slots ?? []).some((s) => s.module !== 'Empty'),
    );
  });

  /**
   * Sticky latch. Once the app has mounted main-flow (because hardware
   * arrived, or because a recall brought models in), stay on main-flow
   * for the rest of the session. Subsequent invalid-config states are
   * handled inside main-flow (grey panels, stale flags, empty pickers)
   * rather than by re-showing the initial gate.
   */
  private readonly hasMainFlowMounted = signal<boolean>(false);

  constructor() {
    effect(() => {
      const hasHardware = this.hasValidHardware();
      const hasModels =
        Object.keys(this.triggerFlowDataService.models$()).length > 0;
      if (hasHardware || hasModels) {
        this.hasMainFlowMounted.set(true);
      }
    });
  }

  /**
   * Show main-flow after the first time either hardware or models
   * become available. Loading screen is the one-shot initial gate.
   */
  protected readonly shouldShowMainFlow = computed<boolean>(() =>
    this.hasMainFlowMounted(),
  );

  ngOnInit(): void {
    this.webSocket.connect();

    this.wsSubscription = this.webSocket.getMessages().subscribe({
      next: (message) => {
        this.processServerData(message);
      },
      error: (error) => {
        console.error('WebSocket error:', error);
      },
      complete: () => {
        console.log('WebSocket connection closed');
      },
    });
  }

  processServerData(message: string): void {
    //console.log('Message received from server:', message);
    try {
      // Parse the message as an IpcData object
      const ipcData: IpcData = JSON.parse(message);

      // Hndle based on the request_type
      switch (ipcData.request_type) {
        case 'evaluate_response': {
          const data = JSON.parse(ipcData.json_value);
          if (data.slot_channel_list && data.models) {
            const statePayload = new TriggerFlowStatePayload(data);
            this.triggerFlowDataService.updateStatePayload(statePayload);
            if (DEBUG) console.log(statePayload);
            vscode.postMessage({ command: 'update_session' , payload: message});
          }
          break;
        }
        case 'Reset_session':
          this.triggerFlowDataService.resetState();
          vscode.postMessage({ command: 'get_initial_configuration' });
          break;
        // Handle other request types as needed
        case 'empty_system_config_error': {
          console.warn(
            'Received empty_system_config_error:',
            ipcData.additional_info,
          );
          const data = JSON.parse(ipcData.json_value);
          if (data.slot_channel_list && data.models) {
            const statePayload = new TriggerFlowStatePayload(data);
            this.triggerFlowDataService.updateStatePayload(statePayload);
            vscode.postMessage({ command: 'update_session', payload: message });
          }
          break;
        }
        default:
          console.warn('Unknown request type:', ipcData.request_type);
      }
    } catch (error) {
      console.error('Error processing server data:', error);
    }
  }

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
    this.webSocket.close();
  }
}
