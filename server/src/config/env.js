require('dotenv').config();

// GARDE FOU SI NON CONFIG - REFUS
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'];

REQUIRED.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Variable d'environnement manquante : ${key}`);
    process.exit(1);
  }
});

module.exports = {
  port:       process.env.PORT        || 3001,
  nodeEnv:    process.env.NODE_ENV    || 'development',

  jwt: {
    secret:    process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  github: {
    clientId:     process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl:  process.env.GITHUB_CALLBACK_URL,
  },

  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  tmpScanDir:      process.env.TMP_SCAN_DIR || './tmp',
};
