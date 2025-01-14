import express, { Request, Response } from 'express'
import { logger } from './logger.js'
import config from './config.js'
import multer from 'multer'
import IpfsPinner from '@buidlguidl/ipfs-uploader'
import { errorHandler } from './middleware/error.js'

const app = express()
app.use(express.json())

const upload = multer()
const pinner = new IpfsPinner({})

const handleUpload = (
  handler: (data: any) => Promise<any>,
  validateFn: (data: any) => boolean,
  errorMessage: string
) => {
  return async (req: Request, res: Response) => {
    try {
      if (!validateFn(req.body)) {
        return res.status(400).json({ error: errorMessage });
      }
      const result = await handler(req.body);
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
    (req) => req.files?.length > 0,
    "Files are required"
  )
);

app.post(
  "/upload/text",
  express.text(),
  handleUpload(
    (text) => pinner.add.text(text),
    (body) => typeof body === "string",
    "Text content is required"
  )
);

app.post(
  "/upload/json",
  express.json(),
  handleUpload(
    (json) => pinner.add.json(json),
    (body) => typeof body === "object" && body !== null,
    "JSON content is required"
  )
);

app.use(errorHandler);

const server = app.listen(config.server.port, () => {
  logger.info(`Server running on port ${config.server.port}`);
});

async function shutdown() {
  logger.info("Shutdown initiated");
  try {
    await Promise.all([server.close(), pinner.stop()]);
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
process.once("SIGQUIT", shutdown); 