import { describe, it, expect, beforeAll } from "vitest";
import { createUploader } from "../src/index.js";
import {
  NodeUploaderConfig,
  S3UploaderConfig,
  PinataUploaderConfig,
} from "../src/types.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

describe("JSON Upload Tests", () => {
  const configs: (
    | S3UploaderConfig
    | PinataUploaderConfig
    | NodeUploaderConfig
  )[] = [
    {
      id: "filebase",
      options: {
        endpoint: process.env.FILEBASE_ENDPOINT!,
        accessKeyId: process.env.FILEBASE_ACCESS_KEY!,
        secretAccessKey: process.env.FILEBASE_SECRET_KEY!,
        bucket: process.env.FILEBASE_BUCKET!,
      },
    },
    {
      id: "pinata",
      options: {
        jwt: process.env.PINATA_JWT!,
        gateway: process.env.PINATA_GATEWAY!,
      },
    },
    {
      id: "bgipfs",
      options: {
        url: process.env.BGIPFS_URL!,
      },
    },
  ];

  // Validate environment variables are present
  beforeAll(() => {
    const requiredEnvVars = [
      "FILEBASE_ENDPOINT",
      "FILEBASE_ACCESS_KEY",
      "FILEBASE_SECRET_KEY",
      "FILEBASE_BUCKET",
      "PINATA_JWT",
      "PINATA_GATEWAY",
      "BGIPFS_URL",
    ];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`
      );
    }
  });

  const testData = {
    string: "test string",
    number: 123,
    boolean: true,
    null: null,
    array: [1, "two", false],
    nested: {
      a: 1,
      b: "two",
      c: [3, 4, 5],
    },
  };

  configs.forEach((config) => {
    describe(`Uploader: ${config.id}`, () => {
      const uploader = createUploader(config);

      it("should successfully upload JSON data", async () => {
        const result = await uploader.add.json(testData);

        expect(result.success).toBe(true);
        expect(result.cid).toBeTruthy();

        console.log(`CID: ${result.cid}`);
      });
    });
  });

  // Type checking tests (these should fail TypeScript compilation)
  it.skip("should not allow invalid JSON values", async () => {
    const uploader = createUploader(configs[0]);

    // @ts-expect-error - Testing invalid JSON value
    await uploader.add.json(() => {});
    // @ts-expect-error - Testing invalid JSON value
    await uploader.add.json(undefined);
    // @ts-expect-error - Testing invalid JSON value
    await uploader.add.json(Symbol("test"));
  });
});
