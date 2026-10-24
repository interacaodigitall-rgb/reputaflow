import { db } from './index.ts';
import { nfcPlates } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc.ts';
import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

function readDbJson(): any {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed) return parsed;
    }
  } catch (e) {
    console.warn('[readDbJson notice]:', e);
  }
  return { businesses: [], customers: [], reviews: [], feedback: [], recoveryCases: [], nfcPlates: [] };
}

function writeDbJson(data: any): void {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[writeDbJson notice]:', e);
  }
}

export async function getAllNfcPlatesSql(): Promise<NfcPlate[]> {
  try {
    const rows = await db.select().from(nfcPlates).orderBy(desc(nfcPlates.createdAt));
    if (rows && rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        status: r.status as any,
        merchant_id: r.merchantId,
        redirect_url: r.redirectUrl,
        scan_count: r.scanCount,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString()
      }));
    }
  } catch (error) {
    // Cloud SQL table may not exist, fallback to db.json
  }

  const jsonDb = readDbJson();
  const plates = jsonDb.nfcPlates || [];
  return plates.map((p: any) => ({
    id: String(p.id).trim(),
    status: String(p.status).toLowerCase() === 'active' ? 'active' : 'inactive',
    merchant_id: p.merchant_id || p.merchantId || null,
    redirect_url: p.redirect_url || p.redirectUrl || null,
    scan_count: Number(p.scan_count ?? p.scanCount ?? 0),
    created_at: p.createdAt || p.created_at || new Date().toISOString(),
    updated_at: p.updatedAt || p.updated_at || new Date().toISOString(),
    merchant_name: p.merchant_name || p.merchantName,
    merchant_slug: p.merchant_slug || p.merchantSlug
  }));
}

export async function getNfcPlateByIdSql(id: string): Promise<NfcPlate | null> {
  const clean = id.trim();
  try {
    const rows = await db.select().from(nfcPlates).where(eq(nfcPlates.id, clean)).limit(1);
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        status: r.status as any,
        merchant_id: r.merchantId,
        redirect_url: r.redirectUrl,
        scan_count: r.scanCount,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString()
      };
    }
  } catch (error) {
    // Fallback to db.json
  }

  const jsonDb = readDbJson();
  const plates: any[] = jsonDb.nfcPlates || [];
  const found = plates.find((p: any) => String(p.id).trim() === clean);
  if (!found) return null;

  return {
    id: String(found.id).trim(),
    status: String(found.status).toLowerCase() === 'active' ? 'active' : 'inactive',
    merchant_id: found.merchant_id || found.merchantId || null,
    redirect_url: found.redirect_url || found.redirectUrl || null,
    scan_count: Number(found.scan_count ?? found.scanCount ?? 0),
    created_at: found.createdAt || found.created_at || new Date().toISOString(),
    updated_at: found.updatedAt || found.updated_at || new Date().toISOString(),
    merchant_name: found.merchant_name || found.merchantName,
    merchant_slug: found.merchant_slug || found.merchantSlug
  };
}

export async function createNfcBatchSql(options: CreateNfcBatchOptions): Promise<NfcPlate[]> {
  const { quantity, prefix = '', startNumber = 1, padDigits = 3 } = options;
  const now = new Date();
  const created: NfcPlate[] = [];

  const jsonDb = readDbJson();
  const existingPlates: any[] = jsonDb.nfcPlates || [];
  const plateMap = new Map<string, any>();
  existingPlates.forEach((p) => plateMap.set(String(p.id).trim(), p));

  for (let i = 0; i < quantity; i++) {
    const currentNum = startNumber + i;
    const padded = String(currentNum).padStart(padDigits, '0');
    const id = prefix ? `${prefix}${padded}` : padded;

    try {
      await db.insert(nfcPlates).values({
        id,
        status: 'inactive',
        merchantId: null,
        redirectUrl: null,
        scanCount: 0,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing();
    } catch (e) {}

    const plateObj = {
      id,
      status: 'inactive',
      merchant_id: null,
      merchantId: null,
      redirect_url: null,
      redirectUrl: null,
      scan_count: 0,
      scanCount: 0,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    if (!plateMap.has(id)) {
      plateMap.set(id, plateObj);
    }

    created.push({
      id,
      status: 'inactive',
      merchant_id: null,
      redirect_url: null,
      scan_count: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    });
  }

  jsonDb.nfcPlates = Array.from(plateMap.values());
  writeDbJson(jsonDb);

  return created;
}

export async function linkNfcPlateSql(id: string, merchantId: string, redirectUrl: string): Promise<boolean> {
  const cleanId = id.trim();
  const now = new Date();

  try {
    await db.update(nfcPlates)
      .set({
        status: 'active',
        merchantId: merchantId || null,
        redirectUrl: redirectUrl.trim(),
        updatedAt: now
      })
      .where(eq(nfcPlates.id, cleanId));
  } catch (error) {}

  const jsonDb = readDbJson();
  const plates: any[] = jsonDb.nfcPlates || [];
  const idx = plates.findIndex((p: any) => String(p.id).trim() === cleanId);
  const targetBiz = (jsonDb.businesses || []).find((b: any) => b.id === merchantId);

  const updatedObj = {
    id: cleanId,
    status: 'active',
    merchant_id: merchantId || null,
    merchantId: merchantId || null,
    redirect_url: redirectUrl.trim(),
    redirectUrl: redirectUrl.trim(),
    scan_count: idx >= 0 ? Number(plates[idx].scan_count || plates[idx].scanCount || 0) : 0,
    scanCount: idx >= 0 ? Number(plates[idx].scan_count || plates[idx].scanCount || 0) : 0,
    merchant_name: targetBiz?.name,
    merchant_slug: targetBiz?.slug,
    createdAt: idx >= 0 ? plates[idx].createdAt || plates[idx].created_at || now.toISOString() : now.toISOString(),
    updatedAt: now.toISOString()
  };

  if (idx >= 0) {
    plates[idx] = updatedObj;
  } else {
    plates.push(updatedObj);
  }

  jsonDb.nfcPlates = plates;
  writeDbJson(jsonDb);
  return true;
}

export async function unlinkNfcPlateSql(id: string): Promise<boolean> {
  const cleanId = id.trim();
  const now = new Date();

  try {
    await db.update(nfcPlates)
      .set({
        status: 'inactive',
        merchantId: null,
        redirectUrl: null,
        updatedAt: now
      })
      .where(eq(nfcPlates.id, cleanId));
  } catch (error) {}

  const jsonDb = readDbJson();
  const plates: any[] = jsonDb.nfcPlates || [];
  const idx = plates.findIndex((p: any) => String(p.id).trim() === cleanId);
  if (idx >= 0) {
    plates[idx].status = 'inactive';
    plates[idx].merchant_id = null;
    plates[idx].merchantId = null;
    plates[idx].redirect_url = null;
    plates[idx].redirectUrl = null;
    plates[idx].updatedAt = now.toISOString();
    jsonDb.nfcPlates = plates;
    writeDbJson(jsonDb);
  }

  return true;
}

export async function deleteNfcPlateSql(id: string): Promise<boolean> {
  const cleanId = id.trim();
  try {
    await db.delete(nfcPlates).where(eq(nfcPlates.id, cleanId));
  } catch (error) {}

  const jsonDb = readDbJson();
  jsonDb.nfcPlates = (jsonDb.nfcPlates || []).filter((p: any) => String(p.id).trim() !== cleanId);
  writeDbJson(jsonDb);
  return true;
}

export async function incrementNfcScanSql(id: string): Promise<void> {
  const cleanId = id.trim();
  try {
    const plate = await getNfcPlateByIdSql(cleanId);
    if (plate) {
      await db.update(nfcPlates)
        .set({
          scanCount: (plate.scan_count || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(nfcPlates.id, cleanId));
    }
  } catch (error) {}

  const jsonDb = readDbJson();
  const plates: any[] = jsonDb.nfcPlates || [];
  const idx = plates.findIndex((p: any) => String(p.id).trim() === cleanId);
  if (idx >= 0) {
    const curr = Number(plates[idx].scan_count || plates[idx].scanCount || 0);
    plates[idx].scan_count = curr + 1;
    plates[idx].scanCount = curr + 1;
    plates[idx].updatedAt = new Date().toISOString();
    jsonDb.nfcPlates = plates;
    writeDbJson(jsonDb);
  }
}
