const express = require('express');
const { crear, listar, detalle, actualizarEstado, asignar, responder, buscar } = require('../controllers/pqrs.controller');

const router = express.Router();

router.post('/',               crear);
router.get('/',                listar);
router.get('/buscar',          buscar);
router.get('/:id',             detalle);
router.patch('/:id/estado',    actualizarEstado);
router.post('/:id/asignar',    asignar);
router.post('/:id/responder',  responder);

module.exports = router;