import { Component, signal } from '@angular/core';
import { MainFlow } from './main-flow/main-flow';

@Component({
  selector: 'app-root',
  imports: [MainFlow],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('trigger-flow-ui');
}
