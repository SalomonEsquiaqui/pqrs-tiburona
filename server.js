require('dotenv').config();

const express = require('express');
const path    = require('path');
const cors    = require('cors');

const authRoutes  = require('./src/routes/auth.routes');
const pqrsRoutes  = require('./src/routes/pqrs.routes');
const userRoutes  = require('./src/routes/user.routes');
const pinesRoutes = require('./src/routes/pines.routes');   // ← NUEVO

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'src/public')));

// Favicon
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/icons/logo-tiburona.ico'));
});

// Rutas API
app.use('/api/auth',  authRoutes);
app.use('/api/pqrs',  pqrsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/pines', pinesRoutes);   // ← NUEVO

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/pages/index.html'));
});

// Fallback SPA
app.get('/pages/:page', (req, res) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, 'src/public/pages', page);
  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Página no encontrada');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅  Servidor corriendo → http://localhost:${PORT}\n`);
});