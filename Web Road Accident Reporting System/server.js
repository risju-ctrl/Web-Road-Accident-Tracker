import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import trafficOfficerRoutes from './routes/trafficOfficer.js';
import adminRoutes from './routes/admin.js';
import categoryRoutes from './routes/categories.js';
import notificationRoutes from './routes/notifications.js';
import summaryRoutes from './routes/summaries.js';
import { errorHandler } from './middleware/errorHandler.js';
import pool from './config/db.js';

dotenv.config();

// Refuse to start with a missing or placeholder signing secret.
const secret = process.env.JWT_SECRET || '';
if (secret.length < 32 || /change_this|secret_key|changeme/i.test(secret)) {
  console.error('JWT_SECRET is missing, too short (min 32 chars) or still a placeholder. Set a strong value in .env.');
  process.exit(1);
}

const app = express();

app.use(helmet());
// Only the listed origins may call the API from a browser (comma separated in CORS_ORIGIN).
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Slow down password guessing and mass sign-ups.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
// summaryRoutes MUST be before /api/reports to avoid :id catching /summaries
app.use('/api/summaries', summaryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/traffic-officer', trafficOfficerRoutes);
app.use('/api/accident-categories', categoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Pay the connection cost now instead of on the first person's request.
  pool.warm();
});
