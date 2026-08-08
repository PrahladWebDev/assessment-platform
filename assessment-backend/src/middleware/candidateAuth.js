const Candidate = require('../models/Candidate');
const Exam = require('../models/Exam');

/**
 * Candidates never log in with a username/password. Their access token (from the
 * one-time exam link, e.g. /exam/:token) is the credential. This middleware resolves
 * it and attaches req.candidate + req.exam, and enforces basic exam-window checks.
 */
async function requireCandidateToken(req, res, next) {
  const token = req.params.token || req.headers['x-candidate-token'];
  if (!token) {
    return res.status(401).json({ message: 'Missing exam access token.' });
  }

  const candidate = await Candidate.findOne({ accessToken: token }).populate('exam');
  if (!candidate) {
    return res.status(404).json({ message: 'Invalid exam link.' });
  }

  const exam = candidate.exam;
  if (!exam) {
    return res.status(404).json({ message: 'Exam no longer exists.' });
  }

  if (['submitted', 'auto_submitted', 'expired'].includes(candidate.status)) {
    return res.status(403).json({ message: 'This exam has already been completed.' });
  }

  const now = new Date();
  if (exam.startsAt && now < exam.startsAt) {
    return res.status(403).json({ message: 'This exam has not started yet.' });
  }
  if (exam.endsAt && now > exam.endsAt) {
    candidate.status = 'expired';
    await candidate.save();
    return res.status(403).json({ message: 'This exam window has closed.' });
  }

  req.candidate = candidate;
  req.exam = exam;
  next();
}

/**
 * Same token resolution as requireCandidateToken, but deliberately WITHOUT the
 * "already completed" (or exam-window) block. Used only for the proctoring routes
 * (recording upload + heartbeat) that must still be able to flush their last few
 * seconds of data in the moments right around submission — whether that's the normal
 * "submit exam" button (server marks the candidate submitted, then the browser stops
 * the recorder and uploads its final segment) or a violation-triggered auto-submit
 * (server marks the candidate auto_submitted immediately, before the client even knows
 * to stop recording). Without this, requireCandidateToken's status check would 403 that
 * final segment and it would silently never reach the admin's recordings list.
 */
async function requireCandidateTokenForProctoring(req, res, next) {
  const token = req.params.token || req.headers['x-candidate-token'];
  if (!token) {
    return res.status(401).json({ message: 'Missing exam access token.' });
  }

  const candidate = await Candidate.findOne({ accessToken: token }).populate('exam');
  if (!candidate) {
    return res.status(404).json({ message: 'Invalid exam link.' });
  }

  const exam = candidate.exam;
  if (!exam) {
    return res.status(404).json({ message: 'Exam no longer exists.' });
  }

  req.candidate = candidate;
  req.exam = exam;
  next();
}

module.exports = { requireCandidateToken, requireCandidateTokenForProctoring };
