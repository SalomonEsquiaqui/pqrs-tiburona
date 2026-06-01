const express = require('express');
const { register, login, resetPassword, buscarCuenta, verifyIdentity } = require('../controllers/auth.controller');
const verifyCaptcha = require('../middlewares/verifyCaptcha');

const router = express.Router();

router.post('/register',        verifyCaptcha, register);
router.post('/login',           verifyCaptcha, login);
router.post('/reset-password',  resetPassword);
router.post('/buscar-cuenta',   buscarCuenta);    // paso 1: correo → hint teléfono
router.post('/verify-identity', verifyIdentity);  // paso 2: verificar tel o ID

module.exports = router;
