import { create, globSource } from "kubo-rpc-client";
import * as jsonCodec from "multiformats/codecs/json";
export class IpfsPinner {
    constructor(config) {
        this.add = {
            file: async (input) => {
                await this.initialize();
                let content;
                if (input instanceof File) {
                    const buffer = await input.arrayBuffer();
                    content = new Uint8Array(buffer);
                }
                else if (typeof window === "undefined") {
                    // Only try to use fs in Node.js environment
                    const { readFile } = await import("fs/promises");
                    const buffer = await readFile(input);
                    content = new Uint8Array(buffer);
                }
                else {
                    throw new Error("File path strings are only supported in Node.js environments");
                }
                const add = await this.rpcClient.add(content, {
                    cidVersion: 1,
                });
                const status = await this.pinCid(add.cid);
                return { cid: add.cid.toString(), status };
            },
            text: async (content) => {
                await this.initialize();
                const add = await this.rpcClient.add(content, {
                    cidVersion: 1,
                });
                const status = await this.pinCid(add.cid);
                return { cid: add.cid.toString(), status };
            },
            json: async (content) => {
                await this.initialize();
                const buf = jsonCodec.encode(content);
                const add = await this.rpcClient.add(buf, {
                    cidVersion: 1,
                });
                const status = await this.pinCid(add.cid);
                return { cid: add.cid.toString(), status };
            },
            directory: async (path, pattern = "**/*") => {
                await this.initialize();
                if (typeof window !== "undefined") {
                    throw new Error("Directory uploads are only supported in Node.js environments");
                }
                try {
                    let rootCid;
                    for await (const file of this.rpcClient.addAll(globSource(path, pattern), {
                        wrapWithDirectory: true,
                        cidVersion: 1,
                    })) {
                        console.log(file);
                        rootCid = file.cid;
                    }
                    if (!rootCid) {
                        throw new Error("No root CID found");
                    }
                    const status = await this.pinCid(rootCid);
                    return { cid: rootCid.toString(), status };
                }
                catch (error) {
                    console.error(error);
                    throw new Error(`Failed to add directory: ${error}`);
                }
            },
            files: async (files) => {
                await this.initialize();
                try {
                    let root;
                    const fileResults = [];
                    for await (const file of this.rpcClient.addAll(files.map((file) => ({ path: file.name, content: file })), {
                        cidVersion: 1,
                        wrapWithDirectory: true,
                    })) {
                        console.log("file to Kubo", file);
                        fileResults.push({ name: file.path, cid: file.cid });
                        root = file.cid;
                    }
                    if (!root) {
                        throw new Error("No root CID found");
                    }
                    console.log("rootCid", root.toString());
                    const status = await this.pinCid(root);
                    return {
                        cid: root.toString(),
                        status,
                        files: fileResults.map((f) => ({
                            name: f.name,
                            cid: f.cid.toString(),
                        })),
                    };
                }
                catch (error) {
                    throw new Error(`Failed to process files: ${error}`);
                }
            },
            globFiles: async (files) => {
                await this.initialize();
                try {
                    let root;
                    const fileResults = [];
                    for await (const file of this.rpcClient.addAll(files, {
                        cidVersion: 1,
                        wrapWithDirectory: true,
                    })) {
                        console.log("file to Kubo", file);
                        fileResults.push({ name: file.path, cid: file.cid });
                        root = file.cid;
                    }
                    if (!root) {
                        throw new Error("No root CID found");
                    }
                    console.log("rootCid", root.toString());
                    const status = await this.pinCid(root);
                    return {
                        cid: root.toString(),
                        status,
                        files: fileResults.map((f) => ({
                            name: f.name,
                            cid: f.cid.toString(),
                        })),
                    };
                }
                catch (error) {
                    throw new Error(`Failed to process glob files: ${error}`);
                }
            },
        };
        this.config = {
            url: config?.url ?? "http://127.0.0.1:9095",
        };
    }
    async initialize() {
        if (this.rpcClient)
            return;
        this.rpcClient = create({ url: this.config.url });
    }
    async pinCid(cid) {
        try {
            console.log("pinning cid", cid.toString());
            await this.rpcClient.pin.add(cid.toString());
            return "pinned";
        }
        catch (error) {
            console.error("Error pinning to cluster:", error);
            return "failed";
        }
    }
}
export default IpfsPinner;
