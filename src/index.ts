import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRoutes from './routes/api';
import { prisma } from './prismaClient';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api', apiRoutes);

// Serve frontend — dashboard is the landing page
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback to dashboard for non-file routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

async function start() {
  // Ensure local user exists for storing reviews
  const existing = await prisma.user.findUnique({ where: { id: 'local-user' } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: 'local-user',
        email: 'local@localhost',
        passwordHash: 'none',
        llmProvider: 'demo',
      },
    });
  }

  // app.listen(PORT, () => {
  //   console.log(`Server running at http://localhost:${PORT}`);
  // });


   app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

start().catch(console.error);
