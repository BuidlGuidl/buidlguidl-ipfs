import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { NodeUploader } from "../src/NodeUploader.js";

// Regression: flat configs (KuboOptions + cidVersion) silently forced
// cidVersion to 1 on the wire while nested `{ options }` configs honored it,
// changing the CIDs of identical content.
describe("cidVersion", () => {
  const requestUrls: string[] = [];
  const server = createServer((req, res) => {
    requestUrls.push(req.url ?? "");
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"Name":"hello.txt","Hash":"QmTestCid","Size":"5"}\n');
    });
  });
  let url: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("honors cidVersion 0 in flat configs", async () => {
    await new NodeUploader({ url, cidVersion: 0 }).add.text("hello");
    expect(requestUrls.at(-1)).toContain("cid-version=0");
  });

  it("honors cidVersion 0 in nested configs", async () => {
    await new NodeUploader({ options: { url }, cidVersion: 0 }).add.text("hello");
    expect(requestUrls.at(-1)).toContain("cid-version=0");
  });

  it("defaults to cidVersion 1", async () => {
    await new NodeUploader({ url }).add.text("hello");
    expect(requestUrls.at(-1)).toContain("cid-version=1");
  });
});
