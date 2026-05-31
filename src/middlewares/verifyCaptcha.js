const fetch = require('node-fetch');

const verifyCaptcha = async (req, res, next) => {
  const token = req.body.captchaToken;

  // En desarrollo sin token real, omitir
  if (!token) {
    if (process.env.NODE_ENV === 'development' || !process.env.RECAPTCHA_SECRET || process.env.RECAPTCHA_SECRET === 'SKIP') {
      return next();
    }
    return res.status(400).json({ error: 'Token de reCAPTCHA requerido.' });
  }

  try {
    const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`
    });
    const json = await resp.json();
    if (!json.success) {
      return res.status(400).json({ error: 'reCAPTCHA inválido.' });
    }
    next();
  } catch (err) {
    console.error('[captcha]', err);
    next(); // En caso de error de red, permitir continuar
  }
};

module.exports = verifyCaptcha;