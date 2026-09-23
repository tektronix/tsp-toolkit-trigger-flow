export interface IIpcDataInterface {
  request_type: string;
  additional_info: string;
  json_value: string;
}

export enum StatusType {
  Info = "Info",
  Warning = "Warning",
  Error = "Error",
}

export interface IStatusMsg {
  status_type: StatusType;
  message: string;
}