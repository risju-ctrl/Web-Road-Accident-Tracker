import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// Evidence uploads: only these types are accepted. The type is decided by the file's
// own bytes, never by the name or Content-Type the client sent.
export const UPLOAD_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function detectType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_ROOT),
  // Random name, no client-controlled path or extension.
  filename: (req, file, cb) => cb(null, randomUUID())
});

export const evidenceUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      const err = new Error('Only JPG, PNG, WebP images and PDF files are allowed');
      err.name = 'ValidationError';
      err.details = { file: err.message };
      return cb(err);
    }
    cb(null, true);
  }
});

// Runs after multer: re-checks the saved bytes, stores the verified type, deletes bad files.
export function verifyUploadedFile(req, res, next) {
  if (!req.file) return next();
  try {
    const fd = fs.openSync(req.file.path, 'r');
    const head = Buffer.alloc(16);
    const n = fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    const real = detectType(head.subarray(0, n));
    if (!real || !ALLOWED[real]) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The file content does not match an allowed type (JPG, PNG, WebP or PDF)' } });
    }
    req.file.mimetype = real;
    next();
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    next(err);
  }
}
