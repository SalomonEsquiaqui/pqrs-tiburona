const express = require('express');
const { register, login, resetPassword } = require('../controllers/auth.controller');
const verifyCaptcha = require('../middlewares/verifyCaptcha');

const router = express.Router();

router.post('/register',       verifyCaptcha, register);
router.post('/login',          verifyCaptcha, login);
router.post('/reset-password', resetPassword); // sin captcha — verificación ya hecha en frontend

module.exports = router;
