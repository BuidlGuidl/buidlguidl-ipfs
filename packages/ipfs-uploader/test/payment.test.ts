import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Credential } from "mppx";
import { assets, charge } from "mppx/evm/server";
import { Mppx } from "mppx/server/core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { NodeUploader } from "../src/NodeUploader.js";
import { describeChallenge, formatAmount } from "../src/payment.js";
import { PaymentDetails } from "../src/types.js";

const RECIPIENT = "0x60Ca282757BA67f3aDbF21F3ba2eBe4Ab3eb01fc";
const PRIVATE_KEY = generatePrivateKey();
const PAYER = privateKeyToAccount(PRIVATE_KEY).address;
const CID = "bafkreifp4ayqsi4wntsdmlyknfxzrpnbcmmoibx5iiaa2ty4tuuvyjlcyy";

interface SeenRequest {
  contentType: string;
  authorization?: string;
  body: Buffer;
}

/**
 * Minimal stand-in for the upload.bgipfs.com worker: keyless requests get a
 * real mppx challenge; requests carrying a credential are "settled" by
 * checking the credential offline (payer + challenge id) and answered with a
 * Kubo-style ndjson add response.
 */
function createFakeEndpoint(options: { gated: boolean }) {
  const mppx = Mppx.create({
    methods: [
      charge({
        currency: assets.baseSepolia.USDC,
        recipient: RECIPIENT,
        // Never called: credentials are checked offline below.
        x402: { facilitator: "http://127.0.0.1:9/unused" },
      }),
    ],
    secretKey: "test-secret-key-at-least-32-bytes-long!!",
  });
  const gate = mppx.charge({ amount: "0.01", description: "test upload" });

  const seen: SeenRequest[] = [];
  const issuedChallengeIds = new Set<string>();
  const settledPayers: string[] = [];

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const authorization = req.headers.authorization;
    seen.push({
      contentType: req.headers["content-type"] ?? "",
      authorization,
      body,
    });

    if (req.headers["x-api-key"]) {
      // Keyed request: no gate.
    } else if (options.gated && authorization?.startsWith("Payment ")) {
      const credential = Credential.deserialize(authorization);
      if (!issuedChallengeIds.has(credential.challenge.id)) {
        res.writeHead(402).end("unknown challenge");
        return;
      }
      settledPayers.push(
        (credential.payload as { from: string }).from.toLowerCase()
      );
    } else if (options.gated) {
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: "POST",
        headers: req.headers as Record<string, string>,
      });
      const result = await gate(request);
      if (result.status !== 402) throw new Error("expected a challenge");
      const challenge = result.challenge.headers.get("www-authenticate") ?? "";
      issuedChallengeIds.add(/id="([^"]+)"/.exec(challenge)?.[1] ?? "");
      res.writeHead(402, Object.fromEntries(result.challenge.headers));
      res.end(await result.challenge.text());
      return;
    }

    if (!(req.headers["content-type"] ?? "").startsWith("multipart/")) {
      res.writeHead(400).end("file argument 'path' is required");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(`{"Name":"hello.txt","Hash":"${CID}","Size":"5"}\n`);
  });

  return { server, seen, settledPayers };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("paid uploads", () => {
  const gated = createFakeEndpoint({ gated: true });
  const open = createFakeEndpoint({ gated: false });
  let gatedUrl: string;
  let openUrl: string;

  beforeAll(async () => {
    gatedUrl = await listen(gated.server);
    openUrl = await listen(open.server);
  });

  afterAll(() => {
    gated.server.close();
    open.server.close();
  });

  it("reacts to a 402 by paying and retrying the upload once", async () => {
    gated.seen.length = 0;
    gated.settledPayers.length = 0;
    const payments: PaymentDetails[] = [];
    const uploader = new NodeUploader({
      url: gatedUrl,
      payment: {
        privateKey: PRIVATE_KEY,
        maxAmount: "0.05",
        onPayment: (payment) => {
          payments.push(payment);
        },
      },
    });

    const result = await uploader.add.text("hello");

    expect(result.success).toBe(true);
    expect(result.cid).toBe(CID);
    expect(result.payment).toMatchObject({
      amount: "0.01",
      currency: "USDC",
      network: "base-sepolia",
      recipient: RECIPIENT,
      description: "test upload",
      payer: PAYER,
    });
    expect(payments).toEqual([result.payment]);
    expect(gated.settledPayers).toEqual([PAYER.toLowerCase()]);

    // First attempt is the real upload (no extra probe); the 402'd attempt is
    // retried once with the credential and an identical body.
    expect(gated.seen).toHaveLength(2);
    const [first, retry] = gated.seen;
    expect(first.contentType).toMatch(/^multipart\//);
    expect(first.authorization).toBeUndefined();
    expect(retry.contentType).toMatch(/^multipart\//);
    expect(retry.authorization).toMatch(/^Payment /);
    expect(retry.body.length).toBeGreaterThan(0);
    expect(retry.body.toString()).toContain("hello");
  });

  it("rebuilds single-use file streams for the paid retry", async () => {
    gated.seen.length = 0;
    const dir = await mkdtemp(join(tmpdir(), "ipfs-uploader-pay-"));
    const filePath = join(dir, "stream.txt");
    await writeFile(filePath, "stream-me-twice");

    const uploader = new NodeUploader({
      url: gatedUrl,
      payment: { privateKey: PRIVATE_KEY, maxAmount: "0.05" },
    });
    const result = await uploader.add.file(filePath);

    expect(result.success).toBe(true);
    expect(gated.seen).toHaveLength(2);
    const [first, retry] = gated.seen;
    expect(retry.body.toString()).toContain("stream-me-twice");
    expect(retry.body.length).toBe(first.body.length);
  });

  it("rebuilds single-use directory sources for the paid retry", async () => {
    gated.seen.length = 0;
    const dir = await mkdtemp(join(tmpdir(), "ipfs-uploader-pay-dir-"));
    await writeFile(join(dir, "a.txt"), "alpha");
    await writeFile(join(dir, "b.txt"), "beta");

    const uploader = new NodeUploader({
      url: gatedUrl,
      payment: { privateKey: PRIVATE_KEY, maxAmount: "0.05" },
    });
    const result = await uploader.add.directory({ dirPath: dir });

    expect(result.success).toBe(true);
    expect(gated.seen).toHaveLength(2);
    const [first, retry] = gated.seen;
    expect(retry.body.toString()).toContain("alpha");
    expect(retry.body.toString()).toContain("beta");
    expect(retry.body.length).toBe(first.body.length);
  });

  it("refuses to pay above maxAmount", async () => {
    const uploader = new NodeUploader({
      url: gatedUrl,
      payment: { privateKey: PRIVATE_KEY, maxAmount: "0.001" },
    });
    const result = await uploader.add.text("hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/exceeds maxAmount/);
  });

  it("reports the price when no payment is configured", async () => {
    gated.seen.length = 0;
    const uploader = new NodeUploader({ url: gatedUrl });
    const result = await uploader.add.text("hello");
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Payment required (0.01 USDC on base-sepolia per upload): configure payment options or use an API key"
    );
    expect(result.paymentRequired).toMatchObject({
      amount: "0.01",
      currency: "USDC",
      network: "base-sepolia",
      recipient: RECIPIENT,
    });
    expect(gated.seen).toHaveLength(1);
  });

  it("adds no requests when the endpoint is not gated", async () => {
    open.seen.length = 0;
    const uploader = new NodeUploader({
      url: openUrl,
      payment: { privateKey: PRIVATE_KEY, maxAmount: "0.05" },
    });
    const result = await uploader.add.text("hello");
    expect(result.success).toBe(true);
    expect(result.payment).toBeUndefined();
    expect(open.seen).toHaveLength(1);
    expect(open.seen[0].authorization).toBeUndefined();
  });

  it("skips payment for keyed requests", async () => {
    gated.seen.length = 0;
    const uploader = new NodeUploader({
      url: gatedUrl,
      headers: { "X-API-Key": "key" },
      payment: { privateKey: PRIVATE_KEY, maxAmount: "0.05" },
    });
    const result = await uploader.add.text("hello");
    expect(result.success).toBe(true);
    expect(result.payment).toBeUndefined();
    expect(gated.seen).toHaveLength(1);
    expect(gated.seen[0].authorization).toBeUndefined();
  });
});

describe("challenge formatting", () => {
  it("formats atomic amounts", () => {
    expect(formatAmount("10000", 6)).toBe("0.01");
    expect(formatAmount("1000000", 6)).toBe("1");
    expect(formatAmount("1500000", 6)).toBe("1.5");
    expect(formatAmount("0", 6)).toBe("0");
  });

  it("describes an evm charge challenge", () => {
    expect(
      describeChallenge({
        request: {
          amount: "10000",
          currency: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          recipient: RECIPIENT,
          methodDetails: { chainId: 8453, decimals: 6 },
        },
      })
    ).toEqual({
      amount: "0.01",
      currency: "USDC",
      network: "base",
      recipient: RECIPIENT,
    });
  });
});
