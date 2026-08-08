const asyncHandler = require('express-async-handler');
const { nanoid } = require('nanoid');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Candidate = require('../models/Candidate');

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
  attachQuestions,
  inviteCandidates,
  listCandidates,
};
