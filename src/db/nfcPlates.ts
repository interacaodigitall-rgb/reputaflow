import { db } from './index.ts';
import { nfcPlates } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc.ts';
import { extractSlugFromUrl } from '../lib/urlHelper.ts';
import { getAllBusinessesSql } from './businesses.ts';
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

function isSamePlateCode(aRaw: string, bRaw: string): boolean {
  const a = String(aRaw || '').trim().toUpperCase();
  const b = String(bRaw || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const aStrip = a.replace(/^(?:QRC|NFC)-?/i, '');
  const bStrip = b.replace(/^(?:QRC|NFC)-?/i, '');
  if (aStrip && bStrip && aStrip === bStrip) return true;
  const aNum = aStrip.replace(/^0+/, '');
  const bNum = bStrip.replace(/^0+/, '');
  if (aNum && bNum && /^\d+$/.test(aNum) && /^\d+$/.test(bNum) && aNum === bNum) return true;
  return false;
}

export async function getAllNfcPlatesSql(): Promise<NfcPlate[]> {
  const allBiz = await getAllBusinessesSql().catch(() => []);
  const jsonDb = readDbJson();
  const jsonPlates: any[] = jsonDb.nfcPlates || [];

  const mapPlate = (raw: any): NfcPlate => {
    const mId = raw.merchant_id || raw.merchantId || null;
    const redir = raw.redirect_url || raw.redirectUrl || null;
    const slugFromUrl = extractSlugFromUrl(redir);
    const matchedBiz = allBiz.find(
      (b) => (mId && b.id === mId) || (slugFromUrl && b.slug.toLowerCase() === slugFromUrl.toLowerCase())
    );
    return {
      id: String(raw.id).trim(),
      status: String(raw.status).toLowerCase() === 'active' ? 'active' : 'inactive',
      merchant_id: mId,
      redirect_url: redir,
      scan_count: Number(raw.scan_count ?? raw.scanCount ?? 0),
      created_at:
        raw.createdAt instanceof Date
          ? raw.createdAt.toISOString()
          : raw.createdAt || raw.created_at || new Date().toISOString(),
      updated_at:
        raw.updatedAt instanceof Date
          ? raw.updatedAt.toISOString()
          : raw.updatedAt || raw.updated_at || new Date().toISOString(),
      merchant_name: matchedBiz?.name || raw.merchant_name || raw.merchantName,
      merchant_slug: slugFromUrl || matchedBiz?.slug || raw.merchant_slug || raw.merchantSlug
    };
  };

  const plateMap = new Map<string, NfcPlate>();
  jsonPlates.forEach((p) => {
    const mapped = mapPlate(p);
    plateMap.set(mapped.id.toUpperCase(), mapped);
  });

  try {
    const rows = await db.select().from(nfcPlates).orderBy(desc(nfcPlates.createdAt));
    if (rows && rows.length > 0) {
      rows.forEach((r) => {
        const mapped = mapPlate(r);
        plateMap.set(mapped.id.toUpperCase(), mapped);
      });
    }
  } catch (error) {
    // Cloud SQL table may not exist, fallback to db.json
  }

  return Array.from(plateMap.values());
}

export async function getNfcPlateByIdSql(id: string): Promise<NfcPlate | null> {
  const clean = (id || '').trim();
  if (!clean) return null;

  const allPlates = await getAllNfcPlatesSql();

  // 1. Exact ID match first (case-insensitive)
  const exact = allPlates.find((p) => p.id.toUpperCase() === clean.toUpperCase());
  if (exact) return exact;

  // 2. Normalized code match (e.g. QRC0004 <-> 004)
  const normMatch = allPlates.find((p) => isSamePlateCode(p.id, clean));
  return normMatch || null;
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
  const cleanRedirect = redirectUrl.trim();
  const now = new Date();

  const allBiz = await getAllBusinessesSql().catch(() => []);
  const slugFromUrl = extractSlugFromUrl(cleanRedirect);
  const targetBiz = allBiz.find(
    (b) => (merchantId && b.id === merchantId) || (slugFromUrl && b.slug.toLowerCase() === slugFromUrl.toLowerCase())
  );
  const resolvedSlug = slugFromUrl || targetBiz?.slug || undefined;
  const resolvedName = targetBiz?.name || undefined;

  try {
    await db
      .insert(nfcPlates)
      .values({
        id: cleanId,
        status: 'active',
        merchantId: merchantId || null,
        redirectUrl: cleanRedirect,
        scanCount: 0,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: nfcPlates.id,
        set: {
          status: 'active',
          merchantId: merchantId || null,
          redirectUrl: cleanRedirect,
          updatedAt: now
        }
      });
  } catch (error) {}

  const jsonDb = readDbJson();
  const plates: any[] = jsonDb.nfcPlates || [];
  let matchedAny = false;

  for (let i = 0; i < plates.length; i++) {
    if (isSamePlateCode(plates[i].id, cleanId)) {
      matchedAny = true;
      const scanCnt = Number(plates[i].scan_count || plates[i].scanCount || 0);
      plates[i] = {
        ...plates[i],
        status: 'active',
        merchant_id: merchantId || null,
        merchantId: merchantId || null,
        redirect_url: cleanRedirect,
        redirectUrl: cleanRedirect,
        scan_count: scanCnt,
        scanCount: scanCnt,
        merchant_name: resolvedName,
        merchant_slug: resolvedSlug,
        updatedAt: now.toISOString()
      };
    }
  }

  if (!matchedAny) {
    plates.push({
      id: cleanId,
      status: 'active',
      merchant_id: merchantId || null,
      merchantId: merchantId || null,
      redirect_url: cleanRedirect,
      redirectUrl: cleanRedirect,
      scan_count: 0,
      scanCount: 0,
      merchant_name: resolvedName,
      merchant_slug: resolvedSlug,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });
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
