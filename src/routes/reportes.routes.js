const express = require('express');
const { listar, crear, actualizar } = require('../controllers/reportes.controller');

const router = express.Router();

router.get('/',         listar);
router.post('/',        crear);
router.patch('/:id',    actualizar);

module.exports = router;

/*
  REGISTRAR EN app.js / server.js:
  
  const reportesRoutes = require('./routes/reportes.routes');
  app.use('/api/reportes', reportesRoutes);
*/
