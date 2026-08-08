const mongoose = require('mongoose');

// Result for a single hidden/visible test case run, stored WITHOUT expected output
// so the raw answer key never round-trips back into a document a frontend query might expose.
const testCaseResultSchema = new mongoose.Schema(
  {
    testCaseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    isHidden: { type: Boolean, required: true },
    passed: { type: Boolean, required: true },
    stdout: { type: String },
    stderr: { type: String },
    timeMs: { type: Number },
    memoryKb: { type: Number },
    exitCode: { type: Number },
  },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    type: { type: String, required: true },

    // MCQ / multi-select / true-false
    selectedOptionIds: [{ type: mongoose.Schema.Types.ObjectId }],

    // fill in blank / subjective
    textAnswer: { type: String },

    // coding
    code: { type: String },
    language: { type: String },
    testCaseResults: [testCaseResultSchema],
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },

    // file upload
    fileUrl: { type: String },
    originalName: { type: String },

    marksAwarded: { type: Number, default: 0 },
    isCorrect: { type: Boolean, default: null }, // null = not auto-gradeable (e.g. subjective)
    gradedAt: { type: Date },
    // Set only by the manual-grading UI (subjective / file_upload answers).
    feedback: { type: String, default: '' },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    answers: [answerSchema],
    totalMarksAwarded: { type: Number, default: 0 },
    totalMarksPossible: { type: Number, default: 0 },
    submittedAt: { type: Date },
    isFinal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

submissionSchema.index({ exam: 1, candidate: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);
