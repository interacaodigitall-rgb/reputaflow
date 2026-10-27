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
import { INITIAL_NFC_PLATES, mapNfcRow } from './src/lib/nfcService.ts';
import { extractSlugFromUrl, findBestMatchingPlate, isPlateAssignedAndActive } from './src/lib/urlHelper.ts';
import { fetchGlobalCloudData } from './src/lib/cloudSync.ts';
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

// POST /api/convert-google-review-url - Smart Resolver for Google Maps & Reviews Links
app.post('/api/convert-google-review-url', async (req, res) => {
  try {
    const rawUrl = (req.body?.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'URL do Google Maps ou Place ID não fornecido.' });
    }

    // 1. Check if rawUrl is already a Place ID (ChIJ...)
    const directPlaceIdMatch = rawUrl.match(/^(?:place_id:)?(ChIJ[a-zA-Z0-9_-]{20,50})$/i);
    if (directPlaceIdMatch) {
      const placeId = directPlaceIdMatch[1];
      return res.json({
        success: true,
        placeId,
        reviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`,
        originalUrl: rawUrl,
        message: 'Place ID convertido com sucesso para o link oficial de avaliação do Google!'
      });
    }

    // 2. Check if already official writereview
    if (rawUrl.includes('search.google.com/local/writereview')) {
      const pIdMatch = rawUrl.match(/(?:placeid|place_id)[=:](ChIJ[a-zA-Z0-9_-]{20,50})/i);
      return res.json({
        success: true,
        placeId: pIdMatch ? pIdMatch[1] : undefined,
        reviewUrl: rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`,
        originalUrl: rawUrl,
        message: 'Link já está no formato oficial do Google Reviews.'
      });
    }

    // 3. Check if g.page profile link
    if (rawUrl.includes('g.page/')) {
      let gPage = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
      if (!gPage.endsWith('/review') && !gPage.includes('/review?')) {
        gPage = gPage.replace(/\/+$/, '') + '/review';
      }
      return res.json({
        success: true,
        reviewUrl: gPage,
        originalUrl: rawUrl,
        message: 'Link de perfil Google Business (g.page) otimizado para avaliação!'
      });
    }

    // 4. Check if Place ID or CID is directly inside the input
    const embeddedPlaceId = rawUrl.match(/(?:placeid|place_id|query_place_id)[=:](ChIJ[a-zA-Z0-9_-]{20,50})/i) ||
                            rawUrl.match(/\b(ChIJ[a-zA-Z0-9_-]{20,50})\b/);
    if (embeddedPlaceId) {
      const placeId = embeddedPlaceId[1];
      return res.json({
        success: true,
        placeId,
        reviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`,
        originalUrl: rawUrl,
        message: 'Place ID extraído do link do Maps com sucesso!'
      });
    }

    // 5. Short link or Google Maps web link: fetch and follow redirects
    let targetFetchUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    let finalUrl = targetFetchUrl;
    let htmlBody = '';

    try {
      const fetchRes = await fetch(targetFetchUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8'
        }
      });
      finalUrl = fetchRes.url || targetFetchUrl;
      htmlBody = await fetchRes.text();
    } catch (fetchErr: any) {
      console.warn('[convert-google-review-url fetch notice]:', fetchErr.message);
    }

    // Check finalUrl and htmlBody for Place ID
    const placeIdInFinal = finalUrl.match(/(?:placeid|place_id|query_place_id)[=:](ChIJ[a-zA-Z0-9_-]{20,50})/i) ||
                           finalUrl.match(/\b(ChIJ[a-zA-Z0-9_-]{20,50})\b/) ||
                           htmlBody.match(/(?:placeid|place_id|query_place_id)[=:"]+(ChIJ[a-zA-Z0-9_-]{20,50})/i) ||
                           htmlBody.match(/["'](ChIJ[a-zA-Z0-9_-]{20,50})["']/);

    if (placeIdInFinal) {
      const placeId = placeIdInFinal[1];
      return res.json({
        success: true,
        placeId,
        reviewUrl: `https://search.google.com/local/writereview?placeid=${placeId}`,
        originalUrl: rawUrl,
        message: 'Link do Maps expandido e Place ID oficial extraído com sucesso!'
      });
    }

    // Check for hex CID in finalUrl or htmlBody: 1s0x...:0x([0-9a-fA-F]+)
    const hexCidMatch = finalUrl.match(/1s0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/i) ||
                        htmlBody.match(/1s0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/i);
    if (hexCidMatch) {
      try {
        const cid = BigInt('0x' + hexCidMatch[1]).toString();
        return res.json({
          success: true,
          cid,
          reviewUrl: `https://maps.google.com/?cid=${cid}`,
          originalUrl: rawUrl,
          message: 'Link do Maps expandido e CID do estabelecimento localizado!'
        });
      } catch {}
    }

    // Check for decimal CID: cid=(\d+)
    const decCidMatch = finalUrl.match(/[?&]cid=(\d+)/i) || htmlBody.match(/[?&]cid=(\d+)/i);
    if (decCidMatch) {
      const cid = decCidMatch[1];
      return res.json({
        success: true,
        cid,
        reviewUrl: `https://maps.google.com/?cid=${cid}`,
        originalUrl: rawUrl,
        message: 'Link do Maps expandido e CID do estabelecimento localizado!'
      });
    }

    // If no Place ID or CID could be extracted, return the expanded/clean URL
    return res.json({
      success: true,
      reviewUrl: finalUrl,
      originalUrl: rawUrl,
      message: 'Link do Maps expandido e verificado.'
    });
  } catch (error: any) {
    console.error('Failed to convert Google review URL:', error);
    res.status(500).json({ error: error.message || 'Erro ao converter link do Google Reviews' });
  }
});

// GET /qr/:code (and /qrc/:code) - 100% Server-Side Instant Redirect for QR Codes
app.get(['/qr/:code', '/qrc/:code'], async (req, res) => {
  // Prevent mobile browser / service worker caching of QR redirects
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');

  // PASSO 1: BUSCA FLEXÍVEL DE PLACAS (NORMALIZAÇÃO DE CÓDIGO)
  const rawCode = (req.params.code || '').trim();
  if (!rawCode) {
    return res.redirect(302, '/?error=qr_nao_atribuido');
  }

  const cleanCode = rawCode.toUpperCase().replace(/^#+/, '');
  const cleanNumber = rawCode.replace(/\D/g, '');
  const shortNumber = cleanNumber.replace(/^0+/, '') || cleanNumber;
  const pad3 = shortNumber ? shortNumber.padStart(3, '0') : '';

  try {
    const orClauses = Array.from(
      new Set(
        [
          `qr_code_id.ilike.%${rawCode}%`,
          cleanNumber ? `qr_code_id.ilike.%${cleanNumber}%` : '',
          pad3 && pad3 !== cleanNumber ? `qr_code_id.ilike.%${pad3}%` : ''
        ].filter(Boolean)
      )
    ).join(',');

    // Consulta direta à tabela `qr_plates` com relação `tenants(slug)`
    const { data: plate, error } = await supabase
      .from('qr_plates')
      .select('tenant_id, qr_code_id, tenants(slug)')
      .or(orClauses)
      .maybeSingle();

    // PASSO 2: VALIDAÇÃO SEGURA DO LOJISTA VINCULADO
    const joinedTenantSlug =
      (plate as any)?.tenants?.slug ||
      (Array.isArray((plate as any)?.tenants) ? (plate as any).tenants[0]?.slug : null);

    if (!error && plate && joinedTenantSlug) {
      const tenantSlug = String(joinedTenantSlug).trim();
      incrementNfcScanSql(plate.qr_code_id || cleanCode).catch(() => {});
      return res.redirect(302, `/r/${encodeURIComponent(tenantSlug)}`);
    }

    const allBiz = await getAllBusinessesSql().catch(() => []);

    // Fallback resiliente em todas as tabelas e fontes
    const supabasePromise = (async () => {
      try {
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
        const lookup = (async () => {
          let supaBizList = [...allBiz];
          for (const bizTable of ['businesses', 'tenants', 'establishments']) {
            try {
              const { data: bRows } = await supabase.from(bizTable).select('*');
              if (Array.isArray(bRows) && bRows.length > 0) {
                supaBizList = [...bRows, ...supaBizList] as any;
              }
            } catch {}
          }

          if (plate && plate.tenant_id) {
            const mappedDirect = mapNfcRow(plate, supaBizList);
            if (isPlateAssignedAndActive(mappedDirect)) return mappedDirect;
          }

          try {
            const { data: qrRows, error: qrErr } = await supabase.from('qr_plates').select('*');
            if (!qrErr && Array.isArray(qrRows) && qrRows.length > 0) {
              const matchedQr = findBestMatchingPlate(qrRows, cleanCode);
              if (matchedQr && isPlateAssignedAndActive(matchedQr)) {
                return mapNfcRow(matchedQr, supaBizList);
              }
            }
          } catch {}

          try {
            const { data: nfcRows, error: nfcErr } = await supabase.from('nfc_plates').select('*');
            if (!nfcErr && Array.isArray(nfcRows) && nfcRows.length > 0) {
              const matchedNfc = findBestMatchingPlate(nfcRows, cleanCode);
              if (matchedNfc && isPlateAssignedAndActive(matchedNfc)) {
                return mapNfcRow(matchedNfc, supaBizList);
              }
            }
          } catch {}

          return null;
        })();
        return await Promise.race([lookup, timeout]);
      } catch {
        return null;
      }
    })();

    const cloudPromise = fetchGlobalCloudData(true)
      .then((cloudData) => {
        if (cloudData && Array.isArray(cloudData.nfcPlates) && cloudData.nfcPlates.length > 0) {
          const matched = findBestMatchingPlate(cloudData.nfcPlates, cleanCode);
          if (matched && isPlateAssignedAndActive(matched)) {
            const bizList =
              Array.isArray(cloudData.businesses) && cloudData.businesses.length > 0
                ? cloudData.businesses
                : allBiz;
            return mapNfcRow(matched, bizList);
          }
        }
        return null;
      })
      .catch(() => null);

    const sqlPromise = getNfcPlateByIdSql(cleanCode).catch(() => null);

    const [supaPlate, cloudPlate, sqlPlate] = await Promise.all([supabasePromise, cloudPromise, sqlPromise]);

    const initPlate = findBestMatchingPlate(INITIAL_NFC_PLATES, cleanCode);

    const allCandidates = [supaPlate, cloudPlate, sqlPlate, initPlate].filter(
      (p): p is NonNullable<typeof p> => Boolean(p && isPlateAssignedAndActive(p))
    );

    const winningPlate = findBestMatchingPlate(allCandidates, cleanCode);

    let tenantSlug: string | null = null;
    let redirectUrl: string | null = null;
    let resolvedPlateId = cleanCode;

    if (winningPlate && isPlateAssignedAndActive(winningPlate)) {
      tenantSlug =
        winningPlate.merchant_slug ||
        extractSlugFromUrl(winningPlate.redirect_url) ||
        winningPlate.merchant_id ||
        null;
      redirectUrl = winningPlate.redirect_url || null;
      resolvedPlateId = winningPlate.id || cleanCode;
    }

    if (tenantSlug || redirectUrl) {
      incrementNfcScanSql(resolvedPlateId).catch(() => {});

      let target = '';
      if (tenantSlug && !tenantSlug.startsWith('http') && !tenantSlug.startsWith('/')) {
        target = `/r/${encodeURIComponent(String(tenantSlug).trim())}`;
      } else if (redirectUrl) {
        target = redirectUrl.trim();
      } else if (tenantSlug) {
        target = tenantSlug.trim();
      }

      if (target.startsWith('/')) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.get('host');
        target = `${proto}://${host}${target}`;
      } else if (!/^https?:\/\//i.test(target)) {
        target = 'https://' + target;
      }

      console.log(`[HTTP 302 Native Server-Side Redirect] Code ${cleanCode} -> ${target}`);
      return res.redirect(302, target);
    }

    // PASSO 3: FALLBACK DE PLACA NÃO ATRIBUÍDA REAL
    console.log(`[HTTP 302 Server-Side Redirect: Não atribuído] Code ${cleanCode} -> /?error=qr_nao_atribuido`);
    return res.redirect(302, '/?error=qr_nao_atribuido');
  } catch (error) {
    console.error('QR server-side redirect error:', error);
    return res.redirect(302, '/?error=qr_nao_atribuido');
  }
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
