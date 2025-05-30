import { Options as KuboOptions } from "kubo-rpc-client";
import { ReadStream } from "fs";

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
  results?: Array<[string, NodeUploadResult]>;
  /** Array of uploaded files with their names and CIDs */
  files?: { name: string; cid: string }[];
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

export interface BrowserDirectoryInput {
  /** Array of files to upload (for browser environments) */
  files: File[];
  /** Name of the directory to create */
  dirName: string;
}

export interface NodeDirectoryInput {
  /** Path to directory (for Node.js environments) */
  dirPath: string;
  /** Pattern to match files in directory */
  pattern?: string;
}

/** Input for directory uploads - either browser files or Node.js path */
export type DirectoryInput = BrowserDirectoryInput | NodeDirectoryInput;

export interface BaseUploader {
  id: string;
  add: {
    file: (input: string | File) => Promise<UploadResult>;
    json: <T extends JsonValue>(content: T) => Promise<UploadResult>;
    text: (content: string) => Promise<UploadResult>;
    directory: (input: DirectoryInput) => Promise<UploadResult>;
    url: (url: string) => Promise<UploadResult>;
    buffer: (content: Buffer | Uint8Array) => Promise<UploadResult>;
  };
}

export interface PinataOptions {
  jwt?: string;
  gateway?: string;
  signingEndpoint?: string;
  groupId?: string;
  expires?: number;
  defaultFilename?: string;
}

export interface PinataJwtOptions {
  jwt: string;
  gateway?: string;
}

export interface PinataPresignedOptions {
  signingEndpoint: string;
  gateway?: string;
}

export interface PinataUploaderConfig {
  options: PinataOptions;
  id?: string;
}

export interface NodeUploaderConfig {
  options: KuboOptions;
  id?: string;
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
export type NodeConfig = KuboOptions | NodeUploaderConfig;
export type PinataConfig = PinataOptions | PinataUploaderConfig;
export type S3Config = S3Options | S3UploaderConfig;

export type UploaderConfig = NodeConfig | PinataConfig | S3Config;

// Add this type to define valid JSON values
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
