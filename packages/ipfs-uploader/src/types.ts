import { Options as KuboOptions } from "kubo-rpc-client";

export { KuboOptions };

export interface NodeInfo {
  id: string;
  url: string;
}

export interface UploadResult {
  cid: string;
}

export interface FileArrayResult extends UploadResult {
  files: { name: string; cid: string }[];
}

export interface NodeUploadResult {
  success: boolean;
  cid?: string;
  error?: string;
  files?: { name: string; cid: string }[];
}

export interface MultiNodeUploadResult {
  success: boolean;
  allNodesSucceeded: boolean;
  cid: string;
  results: Map<string, NodeUploadResult>;
}

export interface GlobSourceFile {
  path: string;
  content: string | Uint8Array | Buffer;
}

export interface BaseUploader<T = UploadResult> {
  id: string;
  add: {
    file: (input: File | string) => Promise<T>;
    text: (content: string) => Promise<T>;
    json: (content: any) => Promise<T>;
    directory: (path: string, pattern?: string) => Promise<T>;
    files: (files: File[]) => Promise<T | FileArrayResult>;
    globFiles: (files: GlobSourceFile[]) => Promise<T | FileArrayResult>;
    url: (url: string) => Promise<T>;
  };
}

export interface PinataOptions {
  jwt: string;
  gateway?: string;
}

export interface NodeUploaderConfig {
  id?: string;
  options: KuboOptions;
}

export interface PinataUploaderConfig {
  id?: string;
  options: PinataOptions;
}

// Allow either simple or full config
export type NodeConfig =
  | KuboOptions
  | (NodeUploaderConfig & { options: KuboOptions });
export type PinataConfig = PinataOptions | PinataUploaderConfig;

export type UploaderConfig = NodeConfig | PinataConfig;
