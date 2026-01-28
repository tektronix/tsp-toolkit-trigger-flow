import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TriggerFlowComponents } from './trigger-flow-components/trigger-flow-components';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TriggerFlowComponents],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('trigger-flow-ui');
}
