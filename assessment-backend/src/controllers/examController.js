const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Candidate = require('../models/Candidate');
const Submission = require('../models/Submission');
const Recording = require('../models/Recording');
const { UPLOAD_ROOT } = require('../middleware/uploadRecording');
const { invalidateReportCache } = require('../services/reportCache');

// POST /api/exams
const createExam = asyncHandler(async (req, res) => {
  const exam = await Exam.create({ ...req.body, createdBy: req.user._id });
  res.status(201).json(exam);
});

// GET /api/exams
const listExams = asyncHandler(async (req, res) => {
  const exams = await Exam.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
  res.json(exams);
});

// GET /api/exams/:id
const getExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id).populate('questions');
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found.');
  }
  res.json(exam);
});

// PUT /api/exams/:id
const updateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found.');
  }
  res.json(exam);
});

// DELETE /api/exams/:id
// Removes the exam along with everything scoped to it: candidates, their
// submissions, and any recorded webcam/screen/audio files (both the Mongo
// documents and the files on disk). The question bank itself is left alone —
// questions are shared/reusable and only referenced by exam.questions, so
// deleting an exam should never delete a question.
const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found.');
  }

  const examId = exam._id;

  // Recording files live on disk and won't be cleaned up by a Mongo cascade,
  // so remove those first. Best-effort per file: a missing/already-gone file
  // shouldn't block the rest of the deletion.
  const recordings = await Recording.find({ exam: examId }).select('_id filePath').lean();
  for (const recording of recordings) {
    try {
      const absolutePath = path.join(UPLOAD_ROOT, recording.filePath);
      if (absolutePath.startsWith(UPLOAD_ROOT) && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (err) {
      console.error(`[exam-delete] failed to remove recording file for ${recording._id}:`, err.message);
    }
  }

  await Promise.all([
    Recording.deleteMany({ exam: examId }),
    Submission.deleteMany({ exam: examId }),
    Candidate.deleteMany({ exam: examId }),
  ]);

  await exam.deleteOne();
  await invalidateReportCache(examId);

  res.status(204).send();
});

// POST /api/exams/:id/questions  { questionIds: [...] }
const attachQuestions = asyncHandler(async (req, res) => {
  const { questionIds } = req.body;
  const exam = await Exam.findById(req.params.id);
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found.');
  }

  const questions = await Question.find({ _id: { $in: questionIds } });
  exam.questions = [...new Set([...exam.questions.map(String), ...questionIds])];
  exam.totalMarks = await computeTotalMarks(exam.questions);
  await exam.save();

  res.json(exam);
});

async function computeTotalMarks(questionIds) {
  const questions = await Question.find({ _id: { $in: questionIds } }).select('marks');
  return questions.reduce((sum, q) => sum + (q.marks || 0), 0);
}

// POST /api/exams/:id/candidates  { candidates: [{ name, email }, ...] }
// Generates one unguessable access token per candidate for the tokenized exam link.
const inviteCandidates = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) {
    res.status(404);
    throw new Error('Exam not found.');
  }

  const { candidates } = req.body;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    res.status(400);
    throw new Error('candidates must be a non-empty array of { name, email }.');
  }

  const created = [];
  for (const c of candidates) {
    const accessToken = nanoid(32);
    // eslint-disable-next-line no-await-in-loop
    const candidate = await Candidate.findOneAndUpdate(
      { exam: exam._id, email: c.email.toLowerCase() },
      { $setOnInsert: { name: c.name, email: c.email, exam: exam._id, accessToken } },
      { upsert: true, new: true }
    );
    created.push({
      id: candidate._id,
      name: candidate.name,
      email: candidate.email,
      examLink: `/exam/${candidate.accessToken}`,
    });
  }

  res.status(201).json({ candidates: created });
});

// GET /api/exams/:id/candidates  - progress overview for the admin dashboard
const listCandidates = asyncHandler(async (req, res) => {
  const candidates = await Candidate.find({ exam: req.params.id }).select('-accessToken');
  res.json(candidates);
});

module.exports = {
  createExam,
  listExams,
  getExam,
  updateExam,
  deleteExam,
  attachQuestions,
  inviteCandidates,
  listCandidates,
};
