const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const questionRoutes = require('./routes/questionRoutes');
const examRoutes = require('./routes/examRoutes');
const candidateExamRoutes = require('./routes/candidateExamRoutes');
const recordingRoutes = require('./routes/recordingRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' })); // generous enough for pasted code, not huge files
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Question images/videos: publicly readable (candidates load them with no admin auth,
// via each app's dev-server /uploads proxy — see vite.config.js). Filenames are
// random tokens, not sequential IDs, so this isn't a browsable listing of anything.
app.use(
  '/uploads/media',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, 'uploads', 'media'))
);

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/exam', candidateExamRoutes); // candidate-facing, tokenized
app.use('/api', recordingRoutes); // admin recording list/download

app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use(errorHandler);

module.exports = app;
