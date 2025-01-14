export interface IpfsPinnerConfig {
    endpointUrl?: string;
    accessToken?: string;
}
export interface UploadResult {
    cid: string;
    status: 'pinned' | 'failed';
}
export interface FileArrayResult extends UploadResult {
    files: {
        name: string;
        cid: string;
    }[];
}
export declare class IpfsPinner {
    private helia;
    private config;
    private interfaces;
    constructor(config?: IpfsPinnerConfig);
    add: {
        file: (input: File | string) => Promise<UploadResult>;
        text: (content: string) => Promise<UploadResult>;
        json: (content: any) => Promise<UploadResult>;
        directory: (path: string, pattern?: string) => Promise<UploadResult>;
        files: (files: File[]) => Promise<FileArrayResult>;
    };
    initialize(): Promise<void>;
    private pinCid;
    stop(): Promise<void>;
}
export default IpfsPinner;
