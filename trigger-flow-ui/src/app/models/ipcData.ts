import { IIpcDataInterface } from "./interface";

export class IpcData {
  request_type: string;
  additional_info: string;
  json_value: string;

  constructor(data: IIpcDataInterface) {
    this.request_type = data.request_type;
    this.additional_info = data.additional_info;
    this.json_value = data.json_value;
  }
}
