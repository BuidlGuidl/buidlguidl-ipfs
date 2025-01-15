import express, { Request, Response } from 'express'
import cors from "cors";
import { logger } from "./logger.js";
import config from "./config.js";
import multer from "multer";
import IpfsPinner from "@buidlguidl/ipfs-uploader";
import { errorHandler } from "./middleware/error.js";

const app = express();
app.use(
  cors({
    origin: config.server.corsOrigin,
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

const upload = multer();

const headers: Record<string, string> = {};

// Add auth headers only if credentials are provided
if (config.auth.username && config.auth.password) {
  const auth = Buffer.from(
    `${config.auth.username}:${config.auth.password}`
  ).toString("base64");
  headers.Authorization = `Basic ${auth}`;
}

const pinner = new IpfsPinner({
  url: config.ipfs.url,
  headers,
});

const handleUpload = (
  handler: (data: any) => Promise<any>,
  validateFn: (req: Request) => boolean,
  errorMessage: string
) => {
  return async (req: Request, res: Response) => {
    try {
      if (!validateFn(req)) {
        return res.status(400).json({ error: errorMessage });
      }
      const result = await handler(req);
      res.json(result);
    } catch (error) {
      logger.error("Upload failed:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  };
};

/**
 * @apiDefine ErrorResponse
 * @apiError {String} error Error message
 * @apiErrorExample {json} Error-Response:
 *     HTTP/1.1 500 Internal Server Error
 *     {
 *       "error": "Upload failed"
 *     }
 */

/**
 * @api {post} /upload/file Upload Single File
 * @apiName UploadFile
 * @apiGroup Upload
 * @apiVersion 1.0.0
 * 
 * @apiDescription Upload a single file to IPFS.
 * 
 * @apiBody {File} file The file to upload (multipart/form-data)
 * 
 * @apiSuccess {String} cid IPFS Content Identifier
 * 
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "cid": "QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ"
 *     }
 * 
 * @apiUse ErrorResponse
 */
app.post(
  "/upload/file",
  upload.single("file"),
  handleUpload(
    (req) => {
      const file = new File([req.file.buffer], req.file.originalname, {
        type: req.file.mimetype,
      });
      return pinner.add.file(file);
    },
    (req) => req.file !== undefined,
    "File is required"
  )
);

/**
 * @api {post} /upload/files Upload Multiple Files
 * @apiName UploadFiles
 * @apiGroup Upload
 * @apiVersion 1.0.0
 *
 * @apiDescription Upload multiple files to IPFS.
 *
 * @apiBody {File[]} files Array of files to upload (multipart/form-data)
 *
 * @apiSuccess {Object[]} results Array of upload results
 * @apiSuccess {String} results.cid IPFS Content Identifier
 * @apiSuccess {String} results.name File name
 *
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "cid": "QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ",
 *       "files": [{
 *         "name": "example.txt",
 *         "cid": "QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ"
 *       }]
 *     }
 *
 * @apiUse ErrorResponse
 */
app.post(
  "/upload/files",
  upload.array("files"),
  handleUpload(
    (req) => {
      const files = req.files.map(
        (file: Express.Multer.File) =>
          new File([file.buffer], file.originalname, {
            type: file.mimetype,
          })
      );
      return pinner.add.files(files);
    },
    (req) => Array.isArray(req.files) && req.files.length > 0,
    "Files are required"
  )
);

/**
 * @api {post} /upload/text Upload Text
 * @apiName UploadText
 * @apiGroup Upload
 * @apiVersion 1.0.0
 *
 * @apiDescription Upload text content to IPFS.
 *
 * @apiBody {String} content Text content to upload
 *
 * @apiSuccess {String} cid IPFS Content Identifier
 *
 * @apiUse ErrorResponse
 */
app.post(
  "/upload/text",
  express.text(),
  handleUpload(
    (req) => pinner.add.text(req.body),
    (req) => typeof req.body === "string",
    "Text content is required"
  )
);

/**
 * @api {post} /upload/json Upload JSON
 * @apiName UploadJSON
 * @apiGroup Upload
 * @apiVersion 1.0.0
 *
 * @apiDescription Upload JSON content to IPFS.
 *
 * @apiBody {Object} content JSON content to upload
 *
 * @apiSuccess {String} cid IPFS Content Identifier
 *
 * @apiUse ErrorResponse
 */
app.post(
  "/upload/json",
  express.json(),
  handleUpload(
    (req) => pinner.add.json(req.body),
    (req) => typeof req.body === "object" && req.body !== null,
    "JSON content is required"
  )
);

/**
 * @api {post} /upload/glob Upload Files from Glob
 * @apiName UploadGlob
 * @apiGroup Upload
 * @apiVersion 1.0.0
 *
 * @apiDescription Upload multiple files using glob pattern.
 *
 * @apiBody {Object[]} files Array of file objects
 * @apiBody {String} files.path File path
 * @apiBody {String|Buffer} files.content File content
 *
 * @apiSuccess {String} cid IPFS Content Identifier
 *
 * @apiUse ErrorResponse
 */
app.post(
  "/upload/glob",
  express.json(),
  handleUpload(
    (req) => pinner.add.globFiles(req.body),
    (req) =>
      Array.isArray(req.body) &&
      req.body.length > 0 &&
      req.body.every(
        (file: any) =>
          typeof file.path === "string" &&
          (typeof file.content === "string" || file.content instanceof Buffer)
      ),
    "Invalid glob source format. Expected array of {path: string, content: string|Buffer}"
  )
);

/**
 * @api {get} /ping Health Check
 * @apiName Ping
 * @apiGroup System
 * @apiVersion 1.0.0
 * 
 * @apiDescription Check if the API is running.
 * 
 * @apiSuccess {String} message Pong response
 * 
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "message": "pong"
 *     }
 */
app.get("/ping", (_req: Request, res: Response) => {
  res.json({ message: "pong" });
});

app.use(errorHandler);

app.use("/docs", express.static("docs"));

const server = app.listen(config.server.port, () => {
  logger.info(`Server running on port ${config.server.port}`);
});

async function shutdown() {
  logger.info("Shutdown initiated");
  try {
    await Promise.all([server.close()]);
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
process.once("SIGQUIT", shutdown); 