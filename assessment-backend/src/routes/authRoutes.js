const router = require('express').Router();
const { register, login, me } = require('../controllers/authController');
const { requireAdmin } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAdmin, me);

module.exports = router;
