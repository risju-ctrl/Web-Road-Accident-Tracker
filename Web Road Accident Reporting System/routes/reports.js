import express from 'express';
import path from 'path';
import fs from 'fs';
import { Report } from '../models/Report.js';
import { Evidence } from '../models/Evidence.js';
import { StatusHistory } from '../models/StatusHistory.js';
import { Notification } from '../models/Notification.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../utils/helpers.js';
import { evidenceUpload, verifyUploadedFile, UPLOAD_ROOT, IMAGE_TYPES } from '../utils/upload.js';

const router = express.Router();

router.use(requireAuth);

router.post('/', requireRole('reporter', 'admin'), async (req, res, next) => {
  try {
    // duplicate_of / confirm_distinct are the reporter's answer to the duplicate warning
    // below; they are not report fields.
    const { duplicate_of, confirm_distinct, ...data } = req.body;
    Report.validate(data);

    // Same time and same place as a report that already exists = probably the same accident.
    const matches = await Report.findPossibleDuplicates(data, req.user.id);
    let linkedTo = null;
    if (matches.length > 0) {
      const own = matches.find((m) => m.own);
      if (own) {
        // Re-sending your own report only creates clutter. Editing it is the way to add detail.
        return res.status(409).json({ error: {
          code: 'DUPLICATE_OWN_REPORT',
          message: `You already submitted this accident as ${own.report_reference}. Open that report to edit it or add photos.`,
          duplicates: [own]
        } });
      }
      if (duplicate_of) {
        // Trust only a report the server itself considers a match.
        const target = matches.find((m) => m.id === Number(duplicate_of));
        if (!target) {
          return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'That report does not match this accident.' } });
        }
        linkedTo = target;
      } else if (!confirm_distinct) {
        return res.status(409).json({ error: {
          code: 'POSSIBLE_DUPLICATE',
          message: 'This looks like an accident that was already reported.',
          duplicates: matches
        } });
      }
    }

    const report = await Report.create(data, req.user.id, { duplicateOf: linkedTo ? linkedTo.id : null });
    await logAudit(req.user.id, 'CREATE_REPORT', 'report', report.id, req, {
      report_reference: report.report_reference,
      ...(linkedTo ? { duplicate_of: linkedTo.report_reference } : {}),
      ...(matches.length > 0 && !linkedTo ? { confirmed_distinct_from: matches.map((m) => m.report_reference) } : {})
    });
    await Notification.create({
      userId: req.user.id,
      reportId: report.id,
      event: 'report.submitted',
      message: linkedTo
        ? `Your report ${report.report_reference} has been submitted and linked to ${linkedTo.report_reference}, the same accident.`
        : `Your report ${report.report_reference} has been submitted.`
    });
    res.status(201).json(report);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, date_from, date_to, category_id, location, q } = req.query;
    const reports = await Report.list(req.user, { status, date_from, date_to, category_id, location, q });
    res.json(reports);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (req.user.role === 'traffic_officer' && report.assigned_to !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const evidence = await Evidence.findByReport(report.id);
    const history = await StatusHistory.findByReport(report.id);
    const duplicates = req.user.role === 'admin' ? await Report.listDuplicates(report.id) : [];
    res.json({ ...report, evidence, status_history: history, duplicates });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole('reporter', 'admin'), async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    const isOwner = req.user.role === 'reporter';
    if (isOwner) {
      if (report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your report' } });
      if (!['submitted','needs_clarification'].includes(report.status)) return res.status(422).json({ error: { code: 'INVALID_STATUS', message: 'Cannot edit in current status' } });
    }
    const updated = await Report.update(report.id, req.body, req.user);
    await logAudit(req.user.id, 'UPDATE_REPORT', 'report', report.id, req, req.body);
    await Notification.create({
      userId: report.reporter_id,
      reportId: report.id,
      event: 'report.updated',
      message: `Your report ${report.report_reference} was updated${isOwner ? '' : ' by an administrator'}.`
    });
    // Supplying the requested information itself moves the report back to Under Review.
    if (isOwner && report.status === 'needs_clarification') {
      const backUnderReview = await Report.updateStatus(report.id, 'under_review', req.user.id, {
        notes: 'Reporter provided the requested information'
      });
      return res.json(backUnderReview);
    }
    res.json(updated);
  } catch (err) { next(err); }
});

router.get('/:id/evidence/:evidenceId', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (req.user.role === 'traffic_officer' && report.assigned_to !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const evidence = await Evidence.findById(req.params.evidenceId);
    if (!evidence || evidence.report_id !== report.id) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    }
    // Files live on disk outside the web root and are only streamed after this authorization check.
    const filePath = path.resolve(process.cwd(), evidence.file_path);
    if (!filePath.startsWith(UPLOAD_ROOT + path.sep)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence file is missing from storage' } });
    // Only verified images are shown inline. Everything else is forced to download, and a
    // sandbox CSP stops any content from running even if a type check were ever bypassed.
    const isImage = IMAGE_TYPES.includes(evidence.mime_type);
    res.setHeader('Content-Type', isImage || evidence.mime_type === 'application/pdf' ? evidence.mime_type : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `${isImage ? 'inline' : 'attachment'}; filename="${String(evidence.file_name).replace(/["\r\n\\]/g, '')}"`);
    fs.createReadStream(filePath).on('error', next).pipe(res);
  } catch (err) { next(err); }
});

router.post('/:id/evidence', requireRole('reporter', 'admin', 'traffic_officer'), evidenceUpload.single('file'), verifyUploadedFile, async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (req.user.role === 'traffic_officer' && report.assigned_to !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    if (!req.file) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    const evidence = await Evidence.create({
      reportId: report.id,
      uploaderId: req.user.id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      description: req.body.description
    });
    await logAudit(req.user.id, 'UPLOAD_EVIDENCE', 'evidence', evidence.id, req, { report_id: report.id });
    // Notify reporter if uploader is not reporter
    if (req.user.id !== report.reporter_id) {
      await Notification.create({
        userId: report.reporter_id,
        reportId: report.id,
        event: 'evidence.added',
        message: `New evidence added to your report ${report.report_reference}.`
      });
    }
    // Notify assigned officer if uploader is not officer
    if (report.assigned_to && req.user.id !== report.assigned_to) {
      await Notification.create({
        userId: report.assigned_to,
        reportId: report.id,
        event: 'evidence.added',
        message: `New evidence added to assigned report ${report.report_reference}.`
      });
    }
    res.status(201).json(evidence);
  } catch (err) { next(err); }
});

router.get('/:id/status-history', async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (req.user.role === 'reporter' && report.reporter_id !== req.user.id) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    const history = await StatusHistory.findByReport(report.id);
    res.json(history);
  } catch (err) { next(err); }
});

export default router;
