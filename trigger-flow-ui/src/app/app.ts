import { Component, OnDestroy, OnInit, signal, inject } from '@angular/core';
import { MainFlow } from './main-flow/main-flow';
import { Websocket } from './services/websocket';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [MainFlow],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('trigger-flow-ui');

  private wsSubscription: Subscription | undefined;
  private webSocket = inject(Websocket);

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

  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
    this.webSocket.close();
  }

  processServerData(message: string): void {
      console.log('Message received from server:', message);
  }
}
