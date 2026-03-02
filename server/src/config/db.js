const { PrismaClient } = require('@prisma/client');

// Singleton : évite de créer plusieurs connexions en dev (hot-reload nodemon)
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

module.exports = prisma;
