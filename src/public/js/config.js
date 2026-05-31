// ===== CONFIGURACIÓN GLOBAL =====
const SUPABASE_URL      = 'https://fouugulxfdhtilgxdqba.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvdXVndWx4ZmRodGlsZ3hkcWJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODI5NDIsImV4cCI6MjA5NTU1ODk0Mn0._iAu61Q5O5XhVJfWJHrksVdDJVQ_oumorAZr8xTacE4';
const RECAPTCHA_SITE_KEY = '6Ld07AItAAAAAG3BxqkTtgbL6rrLvz2G7zILxMwF';
const API_BASE = '/api';

// SLA en horas hábiles por tipo (4–10 días hábiles → convertidos a horas)
const SLA_HORAS = {
  peticion:     56,   // 7 días hábiles
  queja:        32,   // 4 días hábiles
  reclamo:      40,   // 5 días hábiles
  sugerencia:   80,   // 10 días hábiles
  felicitacion: 80    // 10 días hábiles
};

const SLA_DIAS = {
  peticion:     7,
  queja:        4,
  reclamo:      5,
  sugerencia:   10,
  felicitacion: 10
};

const AREAS = [
  'Mantenimiento de cancha',
  'Reservas y pagos',
  'Atención al cliente',
  'Seguridad',
  'Administración general'
];