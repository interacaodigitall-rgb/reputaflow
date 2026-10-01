import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  getAllBusinessesSql,
  getBusinessByIdSql,
  getBusinessBySlugSql,
  upsertBusinessSql,
  updateBusinessSql,
  deleteBusinessSql
} from './src/db/businesses.ts';
import { getReviewsSql, createReviewSql, deleteReviewSql, clearReviewsSql } from './src/db/reviews.ts';
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
import {
  getAllNfcPlatesSql,
  getNfcPlateByIdSql,
  createNfcBatchSql,
  linkNfcPlateSql,
  unlinkNfcPlateSql,
  deleteNfcPlateSql,
  incrementNfcScanSql
} from './src/db/nfcPlates.ts';
import { seedCloudSqlDatabase } from './src/db/seedSql.ts';
import { db } from './src/db/index.ts';
import { platformSettings } from './src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { supabase } from './src/lib/supabase.ts';

const app = express();
const PORT = 3000;

// High body limit for image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure public/uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded media statically
app.use('/uploads', express.static(UPLOADS_DIR));

// Enable CORS & disable HTTP caching for API endpoints
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.path.startsWith('/api')) {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ==========================================
// REAL IMAGE UPLOAD ENDPOINT (WITH SERVERLESS/VERCEL FALLBACK)
// ==========================================
app.post('/api/upload', (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Nenhuma imagem fornecida' });
    }

    try {
      if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      }

      let base64Data = image;
      let extension = 'png';

      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          base64Data = matches[2];
          if (mimeType.includes('jpeg') || mimeType.includes('jpg')) extension = 'jpg';
          else if (mimeType.includes('png')) extension = 'png';
          else if (mimeType.includes('webp')) extension = 'webp';
          else if (mimeType.includes('svg')) extension = 'svg';
        }
      }

      const uniqueId = crypto.randomBytes(8).toString('hex');
      const safeName = filename
        ? `${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        : `img_${Date.now()}_${uniqueId}.${extension}`;

      const filePath = path.join(UPLOADS_DIR, safeName);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);

      const publicUrl = `/uploads/${safeName}`;
      return res.json({
        success: true,
        url: publicUrl,
        filename: safeName,
        size: buffer.length
      });
    } catch (diskErr) {
      console.warn('Filesystem write failed (read-only environment), returning data URL fallback');
      return res.json({
        success: true,
        url: image,
        filename: filename || 'uploaded_image',
        size: image.length
      });
    }
  } catch (error: any) {
    console.error('Error uploading image:', error);
    return res.json({
      success: true,
      url: req.body?.image || '',
      filename: req.body?.filename || 'uploaded_image'
    });
  }
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
    const updated = await updateBusinessSql(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Estabelecimento não encontrado' });
    }
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

// DELETE /api/reviews/:id
app.delete('/api/reviews/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await deleteReviewSql(id);
    res.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('Failed to delete review:', error);
    res.status(500).json({ error: error.message || 'Failed to delete review' });
  }
});

// DELETE /api/reviews (bulk delete)
app.delete('/api/reviews', async (req, res) => {
  const bizId = req.query.businessId as string | undefined;
  try {
    await clearReviewsSql(bizId);
    res.json({ success: true, businessId: bizId || 'all' });
  } catch (error: any) {
    console.error('Failed to clear reviews:', error);
    res.status(500).json({ error: error.message || 'Failed to clear reviews' });
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

// GET /api/recovery_cases and /api/recovery-cases
app.get(['/api/recovery_cases', '/api/recovery-cases'], async (req, res) => {
  const bizId = req.query.businessId as string | undefined;
  try {
    const list = await getRecoveryCasesSql(bizId);
    res.json(list);
  } catch (error: any) {
    console.error('Failed to fetch recovery cases:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch recovery cases' });
  }
});

// POST /api/recovery_cases and /api/recovery-cases
app.post(['/api/recovery_cases', '/api/recovery-cases'], async (req, res) => {
  try {
    const created = await createRecoveryCaseSql(req.body);
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Failed to create recovery case:', error);
    res.status(500).json({ error: error.message || 'Failed to create recovery case' });
  }
});

// PATCH /api/recovery_cases/:id and /api/recovery-cases/:id
app.patch(['/api/recovery_cases/:id', '/api/recovery-cases/:id'], async (req, res) => {
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

// PUT /api/settings
app.put('/api/settings', async (req, res) => {
  try {
    const body = req.body;
    const existing = await getPlatformSettingsSql();
    if (existing) {
      const updated = await db
        .update(platformSettings)
        .set(body)
        .where(eq(platformSettings.id, existing.id))
        .returning();
      return res.json(updated[0]);
    } else {
      const created = await db
        .insert(platformSettings)
        .values({ id: 'global', ...body })
        .returning();
      return res.json(created[0]);
    }
  } catch (error: any) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: error.message || 'Failed to update settings' });
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
// NFC PLATES API & SERVER-SIDE REDIRECTS
// ==========================================

// GET /api/nfc - List all NFC plates
app.get('/api/nfc', async (req, res) => {
  try {
    const plates = await getAllNfcPlatesSql();
    res.json(plates);
  } catch (error: any) {
    console.error('Failed to get NFC plates:', error);
    res.status(500).json({ error: error.message || 'Failed to get NFC plates' });
  }
});

// GET /api/nfc/:id - Get single plate by ID
app.get('/api/nfc/:id', async (req, res) => {
  try {
    const plate = await getNfcPlateByIdSql(req.params.id);
    if (!plate) {
      return res.status(404).json({ error: 'Placa não encontrada' });
    }
    res.json(plate);
  } catch (error: any) {
    console.error('Failed to get NFC plate:', error);
    res.status(500).json({ error: error.message || 'Failed to get NFC plate' });
  }
});

// POST /api/nfc/batch - Create batch of NFC plates
app.post('/api/nfc/batch', async (req, res) => {
  try {
    const { quantity, prefix, startNumber, padDigits } = req.body;
    const created = await createNfcBatchSql({
      quantity: Number(quantity || 10),
      prefix: prefix || '',
      startNumber: Number(startNumber || 1),
      padDigits: Number(padDigits || 3)
    });
    res.json({ success: true, createdCount: created.length, plates: created });
  } catch (error: any) {
    console.error('Failed to create NFC batch:', error);
    res.status(500).json({ error: error.message || 'Failed to create NFC batch' });
  }
});

// POST /api/nfc/link - Link plate to merchant
app.post('/api/nfc/link', async (req, res) => {
  try {
    const { id, merchantId, redirectUrl } = req.body;
    if (!id || !redirectUrl) {
      return res.status(400).json({ error: 'ID e URL de redirecionamento são obrigatórios' });
    }
    const success = await linkNfcPlateSql(id, merchantId, redirectUrl);
    res.json({ success });
  } catch (error: any) {
    console.error('Failed to link NFC plate:', error);
    res.status(500).json({ error: error.message || 'Failed to link NFC plate' });
  }
});

// POST /api/nfc/unlink - Unlink plate
app.post('/api/nfc/unlink', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'ID é obrigatório' });
    }
    const success = await unlinkNfcPlateSql(id);
    res.json({ success });
  } catch (error: any) {
    console.error('Failed to unlink NFC plate:', error);
    res.status(500).json({ error: error.message || 'Failed to unlink NFC plate' });
  }
});

// DELETE /api/nfc/:id - Delete plate
app.delete('/api/nfc/:id', async (req, res) => {
  try {
    const success = await deleteNfcPlateSql(req.params.id);
    res.json({ success });
  } catch (error: any) {
    console.error('Failed to delete NFC plate:', error);
    res.status(500).json({ error: error.message || 'Failed to delete NFC plate' });
  }
});

// POST /api/nfc/scan/:id - Increment scan count
app.post('/api/nfc/scan/:id', async (req, res) => {
  try {
    await incrementNfcScanSql(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to increment scan' });
  }
});

// GET /qr/:id - High-speed Server-side Redirect for Mobile QR / NFC Scanners
app.get('/qr/:id', async (req, res, next) => {
  const plateId = (req.params.id || '').trim();
  if (!plateId) {
    return res.redirect(302, '/');
  }

  try {
    // 1. Try PostgreSQL Cloud SQL
    let redirectUrl: string | null = null;
    const plate = await getNfcPlateByIdSql(plateId);
    if (plate && String(plate.status).toLowerCase() === 'active' && plate.redirect_url) {
      redirectUrl = plate.redirect_url;
      incrementNfcScanSql(plateId).catch(() => {});
    }

    // 2. Fallback to Supabase
    if (!redirectUrl) {
      try {
        const { data } = await supabase
          .from('nfc_plates')
          .select('*')
          .eq('id', plateId)
          .maybeSingle();
        if (data && String(data.status).toLowerCase() === 'active' && (data.redirect_url || data.redirectUrl)) {
          redirectUrl = data.redirect_url || data.redirectUrl;
          try {
            await supabase.rpc('increment_nfc_scan', { plate_id: plateId });
          } catch {}
        }
      } catch (err) {}
    }

    if (redirectUrl) {
      let target = redirectUrl.trim();
      if (target.startsWith('/')) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.get('host');
        target = `${proto}://${host}${target}`;
      } else if (!/^https?:\/\//i.test(target)) {
        target = 'https://' + target;
      }

      console.log(`[HTTP 302 Server Redirect] Plate #${plateId} -> ${target}`);
      return res.redirect(302, target);
    }
  } catch (err) {
    console.warn('[QR Redirect Server fallback]:', err);
  }

  // Pass through to SPA so client shows clear informative message if inactive
  next();
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
  // Non-blocking seed on boot
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
    console.log(`ReputaFlow Server running on http://0.0.0.0:${PORT} with PostgreSQL Cloud SQL & Uploads`);
  });
}

startServer();
