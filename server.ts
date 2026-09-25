import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  getAllBusinessesSql,
  getBusinessByIdSql,
  getBusinessBySlugSql,
  upsertBusinessSql,
  deleteBusinessSql
} from './src/db/businesses.ts';
import { getReviewsSql, createReviewSql } from './src/db/reviews.ts';
import { getFeedbackSql, createFeedbackSql } from './src/db/feedback.ts';
import { getCustomersSql, upsertCustomerSql } from './src/db/customers.ts';
import {
  getRecoveryCasesSql,
  createRecoveryCaseSql,
  updateRecoveryCaseSql
} from './src/db/recoveryCases.ts';
import { getInteractionsSql, createInteractionSql } from './src/db/interactions.ts';
import { getPlansSql, getPlatformSettingsSql } from './src/db/plans.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { seedCloudSqlDatabase } from './src/db/seedSql.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// Enable CORS for external access from Vercel and mobile clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ==========================================
// API ROUTES (Backed by Cloud SQL PostgreSQL)
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'cloudsql-postgresql', timestamp: new Date().toISOString() });
});

// GET /api/businesses
app.get('/api/businesses', async (req, res) => {
  try {
    const list = await getAllBusinessesSql();
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch businesses:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch businesses' });
  }
});

// GET /api/businesses/:identifier (by slug or id)
app.get('/api/businesses/:identifier', async (req, res) => {
  const param = req.params.identifier;
  if (!param) {
    return res.status(400).json({ error: 'Identificador obrigatório' });
  }

  try {
    let biz = await getBusinessBySlugSql(param);
    if (!biz) {
      biz = await getBusinessByIdSql(param);
    }

    if (biz) {
      return res.json(biz);
    }

    return res.status(404).json({ error: 'Estabelecimento não encontrado', identifier: param });
  } catch (error: any) {
    console.error('Failed to fetch business by identifier:', error);
    res.status(500).json({ error: error.message || 'Error fetching business' });
  }
});

// POST /api/businesses
app.post('/api/businesses', async (req, res) => {
  const data = req.body;
  if (!data.name) {
    return res.status(400).json({ error: 'Nome do estabelecimento é obrigatório' });
  }

  try {
    const created = await upsertBusinessSql(data);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Failed to create/update business:', error);
    res.status(500).json({ error: error.message || 'Failed to save business' });
  }
});

// PUT /api/businesses/:id
app.put('/api/businesses/:id', async (req, res) => {
  const id = req.params.id;
  const updates = req.body;

  try {
    const updated = await upsertBusinessSql({ ...updates, id });
    res.json(updated);
  } catch (error: any) {
    console.error('Failed to update business:', error);
    res.status(500).json({ error: error.message || 'Failed to update business' });
  }
});

// DELETE /api/businesses/:id
app.delete('/api/businesses/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await deleteBusinessSql(id);
    res.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('Failed to delete business:', error);
    res.status(500).json({ error: error.message || 'Failed to delete business' });
  }
});

// GET /api/reviews
app.get('/api/reviews', async (req, res) => {
  const bizId = req.query.businessId as string | undefined;
  try {
    const list = await getReviewsSql(bizId);
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch reviews:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch reviews' });
  }
});

// POST /api/reviews
app.post('/api/reviews', async (req, res) => {
  try {
    const created = await createReviewSql(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Failed to create review:', error);
    res.status(500).json({ error: error.message || 'Failed to create review' });
  }
});

// GET /api/feedback
app.get('/api/feedback', async (req, res) => {
  const bizId = req.query.businessId as string | undefined;
  try {
    const list = await getFeedbackSql(bizId);
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch feedback:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch feedback' });
  }
});

// POST /api/feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const created = await createFeedbackSql(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Failed to create feedback:', error);
    res.status(500).json({ error: error.message || 'Failed to create feedback' });
  }
});

// GET /api/customers
app.get('/api/customers', async (req, res) => {
  const bizId = req.query.businessId as string | undefined;
  try {
    const list = await getCustomersSql(bizId);
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch customers:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch customers' });
  }
});

// POST /api/customers
app.post('/api/customers', async (req, res) => {
  try {
    const upserted = await upsertCustomerSql(req.body);
    res.status(201).json(upserted);
  } catch (error: any) {
    console.error('Failed to save customer:', error);
    res.status(500).json({ error: error.message || 'Failed to save customer' });
  }
});

// GET /api/recovery_cases
app.get('/api/recovery_cases', async (req, res) => {
  const bizId = req.query.businessId as string | undefined;
  try {
    const list = await getRecoveryCasesSql(bizId);
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch recovery cases:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch recovery cases' });
  }
});

// POST /api/recovery_cases
app.post('/api/recovery_cases', async (req, res) => {
  try {
    const created = await createRecoveryCaseSql(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Failed to create recovery case:', error);
    res.status(500).json({ error: error.message || 'Failed to create recovery case' });
  }
});

// PATCH /api/recovery_cases/:id
app.patch('/api/recovery_cases/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const updated = await updateRecoveryCaseSql(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Caso não encontrado' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Failed to update recovery case:', error);
    res.status(500).json({ error: error.message || 'Failed to update recovery case' });
  }
});

// GET /api/interactions
app.get('/api/interactions', async (req, res) => {
  const bizId = req.query.businessId as string | undefined;
  try {
    const list = await getInteractionsSql(bizId);
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch interactions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch interactions' });
  }
});

// POST /api/interactions
app.post('/api/interactions', async (req, res) => {
  try {
    const created = await createInteractionSql(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Failed to create interaction:', error);
    res.status(500).json({ error: error.message || 'Failed to create interaction' });
  }
});

// GET /api/plans
app.get('/api/plans', async (req, res) => {
  try {
    const list = await getPlansSql();
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch plans:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch plans' });
  }
});

// GET /api/settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getPlatformSettingsSql();
    res.json(settings);
  } catch (error: any) {
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch settings' });
  }
});

// POST /api/users/sync
app.post('/api/users/sync', async (req, res) => {
  const { uid, email, displayName } = req.body;
  if (!uid || !email) {
    return res.status(400).json({ error: 'UID e email são obrigatórios' });
  }
  try {
    const user = await getOrCreateUser(uid, email, displayName);
    res.json(user);
  } catch (error: any) {
    console.error('Failed to sync user:', error);
    res.status(500).json({ error: error.message || 'Failed to sync user' });
  }
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
  // Attempt non-blocking seed on boot
  seedCloudSqlDatabase().catch((err) => {
    console.warn('Initial seed error:', err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ReputaFlow Server running on http://0.0.0.0:${PORT} with PostgreSQL Cloud SQL`);
  });
}

startServer();
