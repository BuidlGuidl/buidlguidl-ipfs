export interface IpfsPinnerConfig {
    url?: string;
}
export interface UploadResult {
    cid: string;
}
export interface FileArrayResult extends UploadResult {
    files: {
        name: string;
        cid: string;
    }[];
}
export interface GlobSourceFile {
    path: string;
    content: string | Uint8Array | Buffer;
}
export declare class IpfsPinner {
    private rpcClient;
    private config;
    constructor(config?: IpfsPinnerConfig);
    add: {
        file: (input: File | string) => Promise<UploadResult>;
        text: (content: string) => Promise<UploadResult>;
        json: (content: any) => Promise<UploadResult>;
        directory: (path: string, pattern?: string) => Promise<UploadResult>;
        files: (files: File[]) => Promise<FileArrayResult>;
        globFiles: (files: GlobSourceFile[]) => Promise<FileArrayResult>;
    };
    initialize(): Promise<void>;
}
export default IpfsPinner;
