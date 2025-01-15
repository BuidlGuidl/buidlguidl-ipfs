import { create, globSource } from "kubo-rpc-client";
import * as jsonCodec from "multiformats/codecs/json";
export class IpfsPinner {
    constructor(config) {
        this.add = {
            file: async (input) => {
                try {
                    let content;
                    try {
                        if (input instanceof File) {
                            const buffer = await input.arrayBuffer();
                            content = new Uint8Array(buffer);
                        }
                        else if (typeof window === "undefined") {
                            const { readFile } = await import("fs/promises");
                            const buffer = await readFile(input);
                            content = new Uint8Array(buffer);
                        }
                        else {
                            throw new Error("File path strings are only supported in Node.js environments");
                        }
                    }
                    catch (error) {
                        throw new Error(`Failed to read file content: ${error instanceof Error ? error.message : String(error)}`);
                    }
                    const add = await this.rpcClient.add(content, {
                        cidVersion: 1,
                    });
                    return { cid: add.cid.toString() };
                }
                catch (error) {
                    throw new Error(`Failed to add file to IPFS: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
            text: async (content) => {
                try {
                    const add = await this.rpcClient.add(content, {
                        cidVersion: 1,
                    });
                    return { cid: add.cid.toString() };
                }
                catch (error) {
                    throw new Error(`Failed to add text content to IPFS: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
            json: async (content) => {
                try {
                    let buf;
                    try {
                        buf = jsonCodec.encode(content);
                    }
                    catch (error) {
                        throw new Error(`Failed to encode JSON content: ${error instanceof Error ? error.message : String(error)}`);
                    }
                    const add = await this.rpcClient.add(buf, {
                        cidVersion: 1,
                    });
                    return { cid: add.cid.toString() };
                }
                catch (error) {
                    throw new Error(`Failed to add JSON content to IPFS: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
            directory: async (path, pattern = "**/*") => {
                try {
                    if (typeof window !== "undefined") {
                        throw new Error("Directory uploads are only supported in Node.js environments");
                    }
                    let rootCid;
                    for await (const file of this.rpcClient.addAll(globSource(path, pattern), {
                        wrapWithDirectory: true,
                        cidVersion: 1,
                    })) {
                        rootCid = file.cid;
                    }
                    if (!rootCid) {
                        throw new Error("No files found in directory or directory is empty");
                    }
                    return { cid: rootCid.toString() };
                }
                catch (error) {
                    if (error instanceof Error && error.message.includes("ENOENT")) {
                        throw new Error(`Directory not found: ${path}`);
                    }
                    throw new Error(`Failed to add directory to IPFS: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
            files: async (files) => {
                try {
                    if (files.length === 0) {
                        throw new Error("No files provided");
                    }
                    let root;
                    const fileResults = [];
                    for await (const file of this.rpcClient.addAll(files.map((file) => ({ path: file.name, content: file })), {
                        cidVersion: 1,
                        wrapWithDirectory: true,
                    })) {
                        fileResults.push({ name: file.path, cid: file.cid });
                        root = file.cid;
                    }
                    if (!root) {
                        throw new Error("Failed to process files: No root CID generated");
                    }
                    return {
                        cid: root.toString(),
                        files: fileResults.map((f) => ({
                            name: f.name,
                            cid: f.cid.toString(),
                        })),
                    };
                }
                catch (error) {
                    throw new Error(`Failed to add files to IPFS: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
            globFiles: async (files) => {
                try {
                    if (files.length === 0) {
                        throw new Error("No files provided");
                    }
                    let root;
                    const fileResults = [];
                    for await (const file of this.rpcClient.addAll(files, {
                        cidVersion: 1,
                        wrapWithDirectory: true,
                    })) {
                        fileResults.push({ name: file.path, cid: file.cid });
                        root = file.cid;
                    }
                    if (!root) {
                        throw new Error("Failed to process files: No root CID generated");
                    }
                    return {
                        cid: root.toString(),
                        files: fileResults.map((f) => ({
                            name: f.name,
                            cid: f.cid.toString(),
                        })),
                    };
                }
                catch (error) {
                    throw new Error(`Failed to add glob files to IPFS: ${error instanceof Error ? error.message : String(error)}`);
                }
            },
        };
        this.config = {
            url: config?.url ?? "http://127.0.0.1:9095",
            headers: config?.headers ?? {},
        };
        this.rpcClient = create({
            url: this.config.url,
            headers: this.config.headers,
        });
    }
}
export default IpfsPinner;
