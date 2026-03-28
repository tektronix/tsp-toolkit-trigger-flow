import { Component, OnDestroy, OnInit, signal, inject } from '@angular/core';
import { MainFlow } from './main-flow/main-flow';
import { Websocket } from './services/websocket';
import { Subscription } from 'rxjs';
import { IpcData } from './models/ipcData';
import { InitialPayload } from './models/trigger-blocks.model';
import { TriggerFlowDataService } from './services/triggerFlowDataService';

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

  protected readonly initialPayload$ = this.triggerFlowDataService.initialPayload$;

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
        case 'initial_response': {
          const initialPayload = JSON.parse(ipcData.json_value) as InitialPayload;
          this.triggerFlowDataService.setInitialPayload(initialPayload);
          console.log(initialPayload);
          break;
        }
        // Handle other request types as needed
        case 'empty_system_config_error':
          console.log('Received empty system config');
          break;
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
