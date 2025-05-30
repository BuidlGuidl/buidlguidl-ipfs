import { describe, it, expect, beforeAll } from "vitest";
import { createUploader } from "../src/index.js";
import {
  NodeUploaderConfig,
  S3UploaderConfig,
  PinataUploaderConfig,
} from "../src/types.js";
import dotenv from "dotenv";
import { createReadStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, mkdir } from "fs/promises";

// Load environment variables
dotenv.config();

describe("Upload Tests", () => {
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
        headers: {
          "X-API-Key": process.env.BGIPFS_X_API_KEY!,
        },
      },
    },
  ];

  // Create test files before running tests
  beforeAll(async () => {
    const testDir = join(tmpdir(), "ipfs-uploader-test");
    await mkdir(testDir, { recursive: true });

    // Create test files
    await writeFile(join(testDir, "test.txt"), "Hello, World!");
    await writeFile(
      join(testDir, "test.json"),
      JSON.stringify({ test: "data" })
    );
    await writeFile(join(testDir, "multiline.txt"), "Line 1\nLine 2\nLine 3");
  });

  configs.forEach((config) => {
    describe(`Uploader: ${config.id}`, () => {
      const uploader = createUploader(config);

      describe("File Upload", () => {
        it("should upload a text file", async () => {
          const filePath = join(tmpdir(), "ipfs-uploader-test", "test.txt");
          const result = await uploader.add.file(filePath);
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });

        it("should upload a JSON file", async () => {
          const filePath = join(tmpdir(), "ipfs-uploader-test", "test.json");
          const result = await uploader.add.file(filePath);
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });
      });

      describe("JSON Upload", () => {
        it("should upload a simple JSON object", async () => {
          const result = await uploader.add.json({ test: "data" });
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });

        it("should upload a JSON array", async () => {
          const result = await uploader.add.json([1, 2, 3, 4, 5]);
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });
      });

      describe("Text Upload", () => {
        it("should upload plain text", async () => {
          const result = await uploader.add.text("Hello, World!");
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });

        it("should upload multiline text", async () => {
          const result = await uploader.add.text("Line 1\nLine 2\nLine 3");
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });
      });

      describe("Directory Upload", () => {
        it("should upload multiple files in a directory", async () => {
          const testDir = join(tmpdir(), "ipfs-uploader-test");

          const result = await uploader.add.directory({
            dirPath: testDir,
            pattern: "test.{txt,json}",
          });

          if (!result.success) {
            console.error("Upload failed with error:", result.error);
          }

          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });
      });

      describe("URL Upload", () => {
        it("should upload content from a URL", async () => {
          const result = await uploader.add.url(
            "https://raw.githubusercontent.com/ipfs/ipfs/master/README.md"
          );
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });
      });

      describe("Buffer Upload", () => {
        it("should upload a buffer", async () => {
          const buffer = Buffer.from([1, 2, 3, 4, 5]);
          const result = await uploader.add.buffer(buffer);
          expect(result.success).toBe(true);
          expect(result.cid).toBeTruthy();
        });
      });
    });
  });
});
