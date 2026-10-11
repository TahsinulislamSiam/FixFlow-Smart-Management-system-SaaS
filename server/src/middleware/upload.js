import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { ApiError } from '../util/http.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/pdf',
]);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] ?? path.extname(file.originalname).toLowerCase() ?? '';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

 
export const uploadPhotos = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    return cb(ApiError.badRequest(`Unsupported file type "${file.mimetype}". Use JPG, PNG, WEBP, GIF, HEIC or PDF.`));
  },
}).array('photos', 6);
