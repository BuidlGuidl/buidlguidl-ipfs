import { Options as KuboOptions } from "kubo-rpc-client";

export { KuboOptions };

export interface NodeInfo {
  id: string;
  url: string;
}

/** Base interface for all upload results */
export interface BaseUploadResult {
  /** Whether the upload was successful */
  success: boolean;
  /** Content identifier (CID) of the uploaded content */
  cid: string;
  /** Error message if the upload failed */
  error?: string;
}

/** Result from a single upload operation */
export interface UploadResult extends BaseUploadResult {
  /** Number of nodes that succeeded */
  successCount?: number;
  /** Number of nodes that failed */
  errorCount?: number;
  /** Total number of nodes attempted */
  totalNodes?: number;
  /** Whether all nodes in a multi-node upload succeeded */
  allNodesSucceeded?: boolean;
  /** Individual results from each node in a multi-node upload */
  results?: Map<string, NodeUploadResult>;
}

/** Result from a file array upload operation */
export interface FileArrayResult extends BaseUploadResult {
  /** Array of uploaded files with their names and CIDs */
  files: { name: string; cid: string }[];
}

/** Result from a single node in a multi-node upload */
export interface NodeUploadResult extends BaseUploadResult {
  /** Optional array of files if this was a multi-file upload */
  files?: { name: string; cid: string }[];
}

export interface GlobSourceFile {
  path: string;
  content: string | Uint8Array | Buffer;
}

export interface BaseUploader {
  id: string;
  add: {
    file: (input: File | string) => Promise<UploadResult>;
    text: (content: string) => Promise<UploadResult>;
    json: (content: any) => Promise<UploadResult>;
    directory: (path: string, pattern?: string) => Promise<UploadResult>;
    files: (files: File[]) => Promise<UploadResult | FileArrayResult>;
    globFiles: (
      files: GlobSourceFile[]
    ) => Promise<UploadResult | FileArrayResult>;
    url: (url: string) => Promise<UploadResult>;
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

export interface S3Options {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface S3UploaderConfig {
  id?: string;
  options: S3Options;
}

// Allow either simple or full config
export type NodeConfig =
  | KuboOptions
  | (NodeUploaderConfig & { options: KuboOptions });
export type PinataConfig = PinataOptions | PinataUploaderConfig;
export type S3Config = S3Options | S3UploaderConfig;

export type UploaderConfig = NodeConfig | PinataConfig | S3UploaderConfig;
