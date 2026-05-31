// src/routes/pines.routes.js
const express = require('express');
const { crearPin, listarPines, desactivarPin, eliminarPin } = require('../controllers/pines.controller');

const router = express.Router();

router.post('/',              crearPin);       // POST   /api/pines
router.get('/',               listarPines);    // GET    /api/pines?rol=soporte
router.patch('/:id/desactivar', desactivarPin);// PATCH  /api/pines/:id/desactivar
router.delete('/:id',         eliminarPin);    // DELETE /api/pines/:id

module.exports = router;