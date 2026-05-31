const express = require('express');
const { listar, cambiarRol } = require('../controllers/user.controller');

const router = express.Router();

router.get('/',           listar);
router.patch('/:id/rol',  cambiarRol);

module.exports = router;