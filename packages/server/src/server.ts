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
const pinner = new IpfsPinner({});

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

app.post(
  "/upload/text",
  express.text(),
  handleUpload(
    (req) => pinner.add.text(req.body),
    (req) => typeof req.body === "string",
    "Text content is required"
  )
);

app.post(
  "/upload/json",
  express.json(),
  handleUpload(
    (req) => pinner.add.json(req.body),
    (req) => typeof req.body === "object" && req.body !== null,
    "JSON content is required"
  )
);

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

app.get("/ping", (_req: Request, res: Response) => {
  res.json({ message: "pong" });
});

app.use(errorHandler);

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