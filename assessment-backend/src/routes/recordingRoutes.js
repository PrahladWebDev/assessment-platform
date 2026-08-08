const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');
const { listRecordingsForCandidate, downloadRecording } = require('../controllers/recordingController');

router.use(requireAdmin);

router.get('/exams/:examId/candidates/:candidateId/recordings', listRecordingsForCandidate);
router.get('/recordings/:id/download', downloadRecording);

module.exports = router;
