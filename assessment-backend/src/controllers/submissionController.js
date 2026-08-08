const asyncHandler = require('express-async-handler');
const path = require('path');
const fs = require('fs');
const Exam = require('../models/Exam');
const Candidate = require('../models/Candidate');
const Submission = require('../models/Submission');
const Question = require('../models/Question');
const { emitCandidateUpdate } = require('../realtime/socket');
const { invalidateReportCache } = require('../services/reportCache');
const { UPLOAD_ROOT } = require('../middleware/uploadAnswer');

/**
 * GET /api/exams/:id/candidates/:candidateId/submission
 * Full submission for one candidate, with each answer paired with its question's
 * statement/expected-answer/hidden test cases so a grader has everything on one screen —
 * this is admin-only, so unlike the candidate-facing API it's fine to include answer keys.
 */
const getCandidateSubmission = asyncHandler(async (req, res) => {
  const { id: examId, candidateId } = req.params;

  const [exam, candidate, submission] = await Promise.all([
    Exam.findById(examId),
    Candidate.findById(candidateId).select('-accessToken'),
    Submission.findOne({ exam: examId, candidate: candidateId }),
  ]);

  if (!exam) {
    res.status(404);
    throw new Error('Exam not found.');
  }
  if (!candidate) {
    res.status(404);
    throw new Error('Candidate not found.');
  }
  if (!submission) {
    return res.json({ candidate, submission: null, answers: [] });
  }

  const questions = await Question.find({ _id: { $in: submission.answers.map((a) => a.question) } });
  const questionMap = new Map(questions.map((q) => [String(q._id), q]));

  const answers = submission.answers.map((a) => {
    const q = questionMap.get(String(a.question));
    return {
      question: q
        ? {
            _id: q._id,
            type: q.type,
            title: q.title,
            statement: q.statement,
            marks: q.marks,
            expectedAnswer: q.expectedAnswer, // safe here: admin-only endpoint
            options: q.options,
          }
        : null,
      type: a.type,
      selectedOptionIds: a.selectedOptionIds,
      textAnswer: a.textAnswer,
      code: a.code,
      language: a.language,
      fileUrl: a.fileUrl,
      testCaseResults: a.testCaseResults,
      passedCount: a.passedCount,
      totalCount: a.totalCount,
      marksAwarded: a.marksAwarded,
      isCorrect: a.isCorrect,
      feedback: a.feedback,
      gradedAt: a.gradedAt,
      needsManualGrading: ['subjective', 'file_upload'].includes(a.type) && a.isCorrect === null,
    };
  });

  res.json({
    candidate,
    submission: {
      _id: submission._id,
      totalMarksAwarded: submission.totalMarksAwarded,
      totalMarksPossible: submission.totalMarksPossible,
      submittedAt: submission.submittedAt,
      isFinal: submission.isFinal,
    },
    answers,
  });
});

// POST /api/exams/:id/candidates/:candidateId/submission/grade
// { questionId, marksAwarded, feedback } — manual grading for subjective / file_upload
// answers the auto-grader deliberately leaves untouched. Recomputes the submission total
// so the report/report-export never disagrees with what a grader has entered.
const gradeAnswer = asyncHandler(async (req, res) => {
  const { id: examId, candidateId } = req.params;
  const { questionId, marksAwarded, feedback } = req.body;

  if (questionId === undefined || marksAwarded === undefined) {
    res.status(400);
    throw new Error('questionId and marksAwarded are required.');
  }

  const submission = await Submission.findOne({ exam: examId, candidate: candidateId });
  if (!submission) {
    res.status(404);
    throw new Error('No submission found for this candidate.');
  }
  if (!submission.isFinal) {
    res.status(400);
    throw new Error('This candidate has not submitted the exam yet.');
  }

  const answer = submission.answers.find((a) => String(a.question) === String(questionId));
  if (!answer) {
    res.status(404);
    throw new Error('This question is not part of the submission.');
  }

  const question = await Question.findById(questionId).select('marks type');
  if (!question) {
    res.status(404);
    throw new Error('Question not found.');
  }

  const clamped = Math.max(0, Math.min(Number(marksAwarded) || 0, question.marks));
  const previousMarks = answer.marksAwarded || 0;

  answer.marksAwarded = clamped;
  answer.isCorrect = clamped >= question.marks; // full marks = correct, anything else = partial/incorrect
  answer.feedback = feedback || '';
  answer.gradedAt = new Date();
  answer.gradedBy = req.user._id;

  submission.totalMarksAwarded =
    Math.round((submission.totalMarksAwarded - previousMarks + clamped) * 100) / 100;

  await submission.save();
  await invalidateReportCache(examId);
  emitCandidateUpdate(examId, 'graded', {
    candidateId,
    questionId,
    marksAwarded: clamped,
    totalMarksAwarded: submission.totalMarksAwarded,
  });

  res.json({ graded: true, marksAwarded: clamped, totalMarksAwarded: submission.totalMarksAwarded });
});

// GET /api/exams/:id/candidates/:candidateId/submission/answers/:questionId/download  (admin)
// Serves the actual bytes for a file_upload answer. Never exposed as a public static
// path — only reachable through this authenticated admin route, same pattern as recordings.
const downloadAnswerFile = asyncHandler(async (req, res) => {
  const { id: examId, candidateId, questionId } = req.params;

  const submission = await Submission.findOne({ exam: examId, candidate: candidateId });
  if (!submission) {
    res.status(404);
    throw new Error('No submission found for this candidate.');
  }

  const answer = submission.answers.find((a) => String(a.question) === String(questionId));
  if (!answer || !answer.fileUrl) {
    res.status(404);
    throw new Error('No uploaded file for this answer.');
  }

  const absolutePath = path.join(UPLOAD_ROOT, answer.fileUrl);
  if (!absolutePath.startsWith(UPLOAD_ROOT) || !fs.existsSync(absolutePath)) {
    res.status(404);
    throw new Error('File is missing on disk.');
  }

  res.download(absolutePath, answer.originalName || path.basename(absolutePath));
});

module.exports = { getCandidateSubmission, gradeAnswer, downloadAnswerFile };
