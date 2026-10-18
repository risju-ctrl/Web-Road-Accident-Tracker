export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, details: err.details } });
  }
  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message;
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
  }
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: err.message } });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { code: 'DUPLICATE_ENTRY', message: 'Duplicate entry' } });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(400).json({ error: { code: 'FOREIGN_KEY_ERROR', message: 'Referenced record not found' } });
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
