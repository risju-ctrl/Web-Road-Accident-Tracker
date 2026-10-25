import multer from 'multer';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_BUCKET || 'evidence';

// Created on first use so .env is already loaded by then.
let client;
function getClient() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });
  }
  return client;
}

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

// Files are held in memory just long enough to check them and send them to Supabase Storage.
export const evidenceUpload = multer({
  storage: multer.memoryStorage(),
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

// Re-checks the real bytes of the upload and stores the verified type.
export function verifyUploadedFile(req, res, next) {
  if (!req.file) return next();
  const real = detectType(req.file.buffer.subarray(0, 16));
  if (!real || !ALLOWED[real]) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The file content does not match an allowed type (JPG, PNG, WebP or PDF)' } });
  }
  req.file.mimetype = real;
  next();
}

// Saves the file to the bucket and returns its storage key (random name, no client input).
export async function saveToStorage(file) {
  const key = `${randomUUID()}${ALLOWED[file.mimetype]}`;
  const { error } = await getClient().storage.from(BUCKET).upload(key, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw error;
  return key;
}

// Returns the file as a Buffer, or null if it is not in the bucket.
export async function readFromStorage(key) {
  const { data, error } = await getClient().storage.from(BUCKET).download(key);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}