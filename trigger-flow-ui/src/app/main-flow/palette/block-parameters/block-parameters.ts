import { Component } from '@angular/core';
import { Textbox } from '../../../custom-controls/textbox/textbox';
import { Dropdown } from '../../../custom-controls/dropdown/dropdown';

@Component({
  selector: 'app-block-parameters',
  imports: [Textbox, Dropdown],
  templateUrl: './block-parameters.html',
  styleUrl: './block-parameters.css',
})
export class BlockParameters {
  name = '';
  branchTo = '';
  notes = '';
}
