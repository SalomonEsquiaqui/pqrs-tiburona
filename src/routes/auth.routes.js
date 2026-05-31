const express = require('express');
const { register, login } = require('../controllers/auth.controller');
const verifyCaptcha = require('../middlewares/verifyCaptcha');

const router = express.Router();

router.post('/register', verifyCaptcha, register);
router.post('/login',    verifyCaptcha, login);

module.exports = router;