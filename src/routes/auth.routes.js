const express = require('express');
const { register, login, resetPassword, verifyIdentity } = require('../controllers/auth.controller');
const verifyCaptcha = require('../middlewares/verifyCaptcha');

const router = express.Router();

router.post('/register',        verifyCaptcha, register);
router.post('/login',           verifyCaptcha, login);
router.post('/reset-password',  resetPassword);
router.post('/verify-identity', verifyIdentity); // sin captcha — verificación de identidad

module.exports = router;
