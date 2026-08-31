import { Options as KuboOptions } from "kubo-rpc-client";
import { ReadStream } from "fs";
import type { Account } from "viem";

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
  /** Payment made for this upload, when the endpoint charged for it */
  payment?: PaymentDetails;
  /** Set when the upload failed with HTTP 402: what the endpoint asked to be paid */
  paymentRequired?: PaymentDetails;
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
  cidVersion?: 0 | 1;
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

/** Details of a payment challenge (HTTP 402) issued by a paid upload endpoint. */
export interface PaymentDetails {
  /** Price in display units, e.g. "0.01" */
  amount: string;
  /** Currency symbol when known (e.g. "USDC"), otherwise the token address */
  currency: string;
  /** Network name when known (e.g. "base-sepolia"), otherwise "eip155:<chainId>" */
  network: string;
  /** Address receiving the payment */
  recipient: string;
  /** Server-provided description of what is being paid for */
  description?: string;
  /** Address of the paying wallet (set once a credential has been created) */
  payer?: string;
}

/**
 * Opt-in per-upload payment (MPP / x402) for keyless uploads to endpoints
 * that answer with HTTP 402, such as https://upload.bgipfs.com.
 */
export interface PaymentOptions {
  /** Hex private key of the paying wallet. Prefer `account` outside of CLI/server use. */
  privateKey?: `0x${string}`;
  /** viem account used to sign payments (must support `signTypedData`). */
  account?: Account;
  /** Spend cap per upload in display units of the accepted currency (e.g. "0.05" USDC). */
  maxAmount: string;
  /** Called with the challenge details before a payment credential is signed. */
  onPayment?: (payment: PaymentDetails) => void | Promise<void>;
}

export interface NodeUploaderConfig {
  options: KuboOptions;
  id?: string;
  cidVersion?: 0 | 1;
  payment?: PaymentOptions;
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
  | (KuboOptions & { payment?: PaymentOptions; cidVersion?: 0 | 1 })
  | NodeUploaderConfig;
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
