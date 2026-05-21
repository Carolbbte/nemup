/**
 * NemUp backend entrypoint.
 */

import express from 'express';
import cors from 'cors';
import sessionsRouter from './routes/sessions.js';
import { initializeFirebase } from './services/firebaseAdmin.js';
import { config } from './config.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (_req, res) => {
  res.status(200).send({ status: 'ok', message: 'NemUp backend is running' });
});

app.use('/sessions', sessionsRouter);

initializeFirebase()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`🚀 NemUp backend listening on http://localhost:${config.port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize backend:', error);
    process.exit(1);
  });
