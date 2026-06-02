const express = require('express');
const { listar, cambiarRol, actualizarPerfil } = require('../controllers/user.controller');

const router = express.Router();

router.get('/',                listar);
router.patch('/:id/rol',       cambiarRol);
router.patch('/:id/perfil',    actualizarPerfil);

module.exports = router;