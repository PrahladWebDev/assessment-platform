const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    durationMinutes: { type: Number, required: true },
    startsAt: { type: Date },
    endsAt: { type: Date },
    totalMarks: { type: Number, default: 0 },
    negativeMarking: { type: Boolean, default: false },
    proctoring: {
      webcam: { type: Boolean, default: false },
      screenShare: { type: Boolean, default: false },
      fullscreenRequired: { type: Boolean, default: false },
      maxViolations: { type: Number, default: 3 },
    },
    status: { type: String, enum: ['draft', 'scheduled', 'active', 'closed'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Exam', examSchema);
