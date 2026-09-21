import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// Persistent local storage file for server state
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface ServerDb {
  businesses: any[];
  reviews: any[];
  feedback: any[];
  recoveryCases: any[];
  interactions: any[];
}

const DEFAULT_BUSINESSES = [
  {
    id: 'biz_mrnavalha',
    name: 'Mr. Navalha',
    slug: 'mrnavalha',
    category: 'Barbearia & Estética',
    logoUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=150&auto=format&fit=crop&q=80',
    phone: '+351 912 345 678',
    email: 'mrnavalha@reputaflow.com',
    address: 'Rua do Comércio, 120 - Lisboa',
    googleReviewUrl: 'https://g.page/r/mrnavalha/review',
    status: 'active',
    planId: 'plan_pro',
    ownerId: 'owner_mrnavalha',
    currency: 'EUR',
    password: 'reputa123',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

function loadDb(): ServerDb {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      const businesses = (data.businesses && data.businesses.length > 0) ? data.businesses : DEFAULT_BUSINESSES;
      return {
        businesses,
        reviews: data.reviews || [],
        feedback: data.feedback || [],
        recoveryCases: data.recoveryCases || [],
        interactions: data.interactions || []
      };
    }
  } catch (err) {
    console.error('Error reading db.json:', err);
  }

  const initialDb: ServerDb = {
    businesses: DEFAULT_BUSINESSES,
    reviews: [],
    feedback: [],
    recoveryCases: [],
    interactions: []
  };

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing initial db.json:', err);
  }

  return initialDb;
}

let db = loadDb();

function saveDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving db.json:', err);
  }
}

// Normalize strings for matching (stripping accents, hyphens, spaces, underscores)
function normalizeKey(str: string = ''): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ==========================================
// API ROUTES
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/businesses
app.get('/api/businesses', (req, res) => {
  res.json(db.businesses);
});

// GET /api/businesses/:identifier (by slug, id, or normalized name)
app.get('/api/businesses/:identifier', (req, res) => {
  const param = req.params.identifier;
  if (!param) {
    return res.status(400).json({ error: 'Identificador obrigatório' });
  }

  const clean = param.toLowerCase().trim();
  const norm = normalizeKey(param);

  const found = db.businesses.find((b: any) => {
    const bId = (b.id || '').toLowerCase();
    const bSlug = (b.slug || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();

    // Exact matches
    if (bId === clean || bSlug === clean || bName === clean) return true;

    // Normalized matches (ignores hyphens, spaces, underscores)
    if (normalizeKey(bSlug) === norm || normalizeKey(bId) === norm || normalizeKey(bName) === norm) {
      return true;
    }

    return false;
  });

  if (found) {
    return res.json(found);
  }

  return res.status(404).json({ error: 'Estabelecimento não encontrado', identifier: param });
});

// POST /api/businesses
app.post('/api/businesses', (req, res) => {
  const data = req.body;
  if (!data.name) {
    return res.status(400).json({ error: 'Nome do estabelecimento é obrigatório' });
  }

  const cleanSlug = (data.slug || data.name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');

  const newId = data.id || `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const newBiz = {
    ...data,
    id: newId,
    slug: cleanSlug,
    status: data.status || 'active',
    currency: data.currency || 'EUR',
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Upsert in local db
  const existingIdx = db.businesses.findIndex((b: any) => b.id === newId || b.slug === cleanSlug);
  if (existingIdx >= 0) {
    db.businesses[existingIdx] = { ...db.businesses[existingIdx], ...newBiz };
  } else {
    db.businesses.unshift(newBiz);
  }

  saveDb();
  res.status(201).json(newBiz);
});

// PUT /api/businesses/:id
app.put('/api/businesses/:id', (req, res) => {
  const id = req.params.id;
  const updates = req.body;

  const idx = db.businesses.findIndex((b: any) => b.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'Estabelecimento não encontrado' });
  }

  db.businesses[idx] = {
    ...db.businesses[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  saveDb();
  res.json(db.businesses[idx]);
});

// DELETE /api/businesses/:id
app.delete('/api/businesses/:id', (req, res) => {
  const id = req.params.id;
  db.businesses = db.businesses.filter((b: any) => b.id !== id);
  saveDb();
  res.json({ success: true });
});

// GET /api/reviews
app.get('/api/reviews', (req, res) => {
  const bizId = req.query.businessId as string;
  if (bizId) {
    return res.json(db.reviews.filter((r: any) => r.businessId === bizId));
  }
  res.json(db.reviews);
});

// POST /api/reviews
app.post('/api/reviews', (req, res) => {
  const review = {
    id: `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  db.reviews.unshift(review);
  saveDb();
  res.status(201).json(review);
});

// GET /api/feedback
app.get('/api/feedback', (req, res) => {
  const bizId = req.query.businessId as string;
  if (bizId) {
    return res.json(db.feedback.filter((f: any) => f.businessId === bizId));
  }
  res.json(db.feedback);
});

// POST /api/feedback
app.post('/api/feedback', (req, res) => {
  const fb = {
    id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  db.feedback.unshift(fb);
  saveDb();
  res.status(201).json(fb);
});

// GET /api/recovery_cases
app.get('/api/recovery_cases', (req, res) => {
  const bizId = req.query.businessId as string;
  if (bizId) {
    return res.json(db.recoveryCases.filter((rc: any) => rc.businessId === bizId));
  }
  res.json(db.recoveryCases);
});

// POST /api/recovery_cases
app.post('/api/recovery_cases', (req, res) => {
  const rec = {
    id: `rec_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    status: 'pending',
    priority: req.body.priority || 'medium',
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.recoveryCases.unshift(rec);
  saveDb();
  res.status(201).json(rec);
});

// PATCH /api/recovery_cases/:id
app.patch('/api/recovery_cases/:id', (req, res) => {
  const id = req.params.id;
  const idx = db.recoveryCases.findIndex((rc: any) => rc.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'Caso não encontrado' });
  }
  db.recoveryCases[idx] = {
    ...db.recoveryCases[idx],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  saveDb();
  res.json(db.recoveryCases[idx]);
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
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
    console.log(`ReputaFlow Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
