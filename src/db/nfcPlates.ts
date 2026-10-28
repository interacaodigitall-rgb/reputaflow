import { db } from './index.ts';
import { nfcPlates } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc.ts';
import { extractSlugFromUrl, isSamePlateCode, findBestMatchingPlate } from '../lib/urlHelper.ts';
import { getAllBusinessesSql, readDbJson, writeDbJson } from './businesses.ts';

function extractNumericSerial(idOrCode: string): number {
  if (!idOrCode) return 0;
  const digits = String(idOrCode).replace(/\D/g, '');
  if (!digits) return 0;
  const num = parseInt(digits, 10);
  return isNaN(num) || num > 100000 ? 0 : num;
}

export async function getAllNfcPlatesSql(): Promise<NfcPlate[]> {
  const allBiz = await getAllBusinessesSql().catch(() => []);
  const jsonDb = readDbJson();
  const jsonPlates: any[] = jsonDb.nfcPlates || [];

  const mapPlate = (raw: any): NfcPlate | null => {
    const rawId = String(raw?.id || '').trim();
    const num = extractNumericSerial(rawId);
    // Only keep numbered physical plates (e.g. 001, 002, 003...) to prevent duplicate slug cards
    if (num <= 0) return null;

    const canonicalId = String(num).padStart(3, '0');
    const mId = raw.merchant_id || raw.merchantId || null;
    const redir = raw.redirect_url || raw.redirectUrl || null;
    const slugFromUrl = extractSlugFromUrl(redir);

    const matchedBiz = allBiz.find(
      (b) =>
        (mId && (b.id === mId || b.slug.toLowerCase() === String(mId).toLowerCase())) ||
        (slugFromUrl && b.slug.toLowerCase() === slugFromUrl.toLowerCase())
    );

    // If the plate points to a business that no longer exists (was deleted), treat it as inactive stock
    if (!matchedBiz) {
      return {
        id: canonicalId,
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        scan_count: Number(raw.scan_count ?? raw.scanCount ?? 0),
        created_at:
          raw.createdAt instanceof Date
            ? raw.createdAt.toISOString()
            : raw.createdAt || raw.created_at || new Date().toISOString(),
        updated_at:
          raw.updatedAt instanceof Date
            ? raw.updatedAt.toISOString()
            : raw.updatedAt || raw.updated_at || new Date().toISOString(),
        merchant_name: undefined,
        merchant_slug: undefined
      };
    }

    const isActive = String(raw.status).toLowerCase() === 'active';
    return {
      id: canonicalId,
      status: isActive ? 'active' : 'inactive',
      merchant_id: isActive ? matchedBiz.id : null,
      redirect_url: isActive ? `/r/${encodeURIComponent(matchedBiz.slug)}` : null,
      scan_count: Number(raw.scan_count ?? raw.scanCount ?? 0),
      created_at:
        raw.createdAt instanceof Date
          ? raw.createdAt.toISOString()
          : raw.createdAt || raw.created_at || new Date().toISOString(),
      updated_at:
        raw.updatedAt instanceof Date
          ? raw.updatedAt.toISOString()
          : raw.updatedAt || raw.updated_at || new Date().toISOString(),
      merchant_name: isActive ? matchedBiz.name : undefined,
      merchant_slug: isActive ? matchedBiz.slug : undefined,
      merchant_logo_url: isActive ? matchedBiz.logoUrl || undefined : undefined
    };
  };

  const plateMap = new Map<string, NfcPlate>();
  jsonPlates.forEach((p) => {
    const mapped = mapPlate(p);
    if (mapped) plateMap.set(mapped.id, mapped);
  });

  try {
    const rows = await db.select().from(nfcPlates).orderBy(desc(nfcPlates.createdAt));
    if (rows && rows.length > 0) {
      rows.forEach((r) => {
        const mapped = mapPlate(r);
        if (mapped) {
          const existing = plateMap.get(mapped.id);
          if (!existing || (mapped.status === 'active' && existing.status !== 'active')) {
            plateMap.set(mapped.id, mapped);
          }
        }
      });
    }
  } catch {}

  // Enforce STRICTLY 1 plate per merchant (if a merchant is on multiple plates, keep only the most recently updated one)
  const allPlates = Array.from(plateMap.values()).sort(
    (a, b) => extractNumericSerial(a.id) - extractNumericSerial(b.id)
  );
  const merchantWinnerPlate = new Map<string, NfcPlate>();

  for (const p of allPlates) {
    if (p.status === 'active' && (p.merchant_id || p.merchant_slug)) {
      const mKey = (p.merchant_slug || p.merchant_id || '').toLowerCase();
      const prev = merchantWinnerPlate.get(mKey);
      if (!prev) {
        merchantWinnerPlate.set(mKey, p);
      } else {
        const prevTime = new Date(prev.updated_at || 0).getTime() || 0;
        const currTime = new Date(p.updated_at || 0).getTime() || 0;
        if (currTime > prevTime) {
          prev.status = 'inactive';
          prev.merchant_id = null;
          prev.redirect_url = null;
          prev.merchant_name = undefined;
          prev.merchant_slug = undefined;
          merchantWinnerPlate.set(mKey, p);
        } else {
          p.status = 'inactive';
          p.merchant_id = null;
          p.redirect_url = null;
          p.merchant_name = undefined;
          p.merchant_slug = undefined;
        }
      }
    }
  }

  return allPlates;
}

export async function getNfcPlateByIdSql(id: string): Promise<NfcPlate | null> {
  const clean = (id || '').trim();
  if (!clean) return null;

  const allPlates = await getAllNfcPlatesSql();
  return findBestMatchingPlate(allPlates, clean);
}

export async function createNfcBatchSql(options: CreateNfcBatchOptions): Promise<NfcPlate[]> {
  const { quantity, prefix = '', startNumber = 1, padDigits = 3 } = options;
  const now = new Date();
  const created: NfcPlate[] = [];

  const jsonDb = readDbJson();
  const existingPlates: any[] = jsonDb.nfcPlates || [];
  const plateMap = new Map<string, any>();
  existingPlates.forEach((p) => {
    const num = extractNumericSerial(p.id);
    if (num > 0) {
      const canonical = String(num).padStart(padDigits, '0');
      plateMap.set(canonical, { ...p, id: canonical });
    }
  });

  // Find highest existing plate number to avoid overlap
  let highestNum = 5;
  for (const k of plateMap.keys()) {
    const n = extractNumericSerial(k);
    if (n > highestNum) highestNum = n;
  }
  const safeStart = Math.max(highestNum + 1, startNumber);

  for (let i = 0; i < quantity; i++) {
    const currentNum = safeStart + i;
    const padded = String(currentNum).padStart(padDigits, '0');
    const id = prefix ? `${prefix}${padded}` : padded;

    if (plateMap.has(id)) continue;

    try {
      await db
        .insert(nfcPlates)
        .values({
          id,
          status: 'inactive',
          merchantId: null,
          redirectUrl: null,
          scanCount: 0,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoNothing();
    } catch {}

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

    plateMap.set(id, plateObj);
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

export async function linkNfcPlateSql(
  id: string,
  merchantId: string,
  redirectUrl: string = ''
): Promise<boolean> {
  const num = extractNumericSerial(id);
  const cleanId = num > 0 ? String(num).padStart(3, '0') : String(id || '').trim();
  const now = new Date();

  const allBiz = await getAllBusinessesSql().catch(() => []);
  const slugFromUrl = extractSlugFromUrl(redirectUrl);
  const cleanMerchantKey = String(merchantId || '').trim().toLowerCase();
  const targetBiz = allBiz.find(
    (b) =>
      (merchantId && b.id === merchantId) ||
      (cleanMerchantKey && String(b.slug || '').toLowerCase() === cleanMerchantKey) ||
      (slugFromUrl && String(b.slug || '').toLowerCase() === slugFromUrl.toLowerCase())
  );
  const resolvedMerchantId = targetBiz?.id || merchantId;
  const resolvedSlug = targetBiz?.slug || slugFromUrl || (cleanMerchantKey && !cleanMerchantKey.startsWith('biz_') ? cleanMerchantKey : undefined);
  const resolvedName = targetBiz?.name || undefined;
  const cleanRedirect = resolvedSlug
    ? `/r/${encodeURIComponent(resolvedSlug)}`
    : String(redirectUrl || '').trim();

  // 1. In PostgreSQL: Unlink any other plate previously assigned to this same merchant (1 merchant = 1 plate)
  try {
    if (resolvedMerchantId) {
      await db
        .update(nfcPlates)
        .set({
          status: 'inactive',
          merchantId: null,
          redirectUrl: null,
          updatedAt: now
        })
        .where(eq(nfcPlates.merchantId, resolvedMerchantId));
    }

    await db
      .insert(nfcPlates)
      .values({
        id: cleanId,
        status: 'active',
        merchantId: resolvedMerchantId || null,
        redirectUrl: cleanRedirect,
        scanCount: 0,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: nfcPlates.id,
        set: {
          status: 'active',
          merchantId: resolvedMerchantId || null,
          redirectUrl: cleanRedirect,
          updatedAt: now
        }
      });
  } catch {}

  // 2. In db.json: Unlink any other plate for this merchant, then link the target plate
  const jsonDb = readDbJson();
  const plates: any[] = (jsonDb.nfcPlates || []).filter((p: any) => extractNumericSerial(p.id) > 0);
  let matchedAny = false;

  for (let i = 0; i < plates.length; i++) {
    const pMid = plates[i].merchant_id || plates[i].merchantId;
    const pSlug = plates[i].merchant_slug || extractSlugFromUrl(plates[i].redirect_url);

    if (isSamePlateCode(plates[i].id, cleanId)) {
      matchedAny = true;
      const scanCnt = Number(plates[i].scan_count || plates[i].scanCount || 0);
      plates[i] = {
        ...plates[i],
        id: cleanId,
        status: 'active',
        merchant_id: resolvedMerchantId || null,
        merchantId: resolvedMerchantId || null,
        redirect_url: cleanRedirect,
        redirectUrl: cleanRedirect,
        scan_count: scanCnt,
        scanCount: scanCnt,
        merchant_name: resolvedName,
        merchant_slug: resolvedSlug,
        updatedAt: now.toISOString()
      };
    } else if (
      (resolvedMerchantId && pMid === resolvedMerchantId) ||
      (resolvedSlug && pSlug && pSlug.toLowerCase() === resolvedSlug.toLowerCase())
    ) {
      // Unlink duplicate plate for the same merchant
      plates[i] = {
        ...plates[i],
        status: 'inactive',
        merchant_id: null,
        merchantId: null,
        redirect_url: null,
        redirectUrl: null,
        merchant_name: undefined,
        merchant_slug: undefined,
        updatedAt: now.toISOString()
      };
    }
  }

  if (!matchedAny) {
    plates.push({
      id: cleanId,
      status: 'active',
      merchant_id: resolvedMerchantId || null,
      merchantId: resolvedMerchantId || null,
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
  const num = extractNumericSerial(id);
  const cleanId = num > 0 ? String(num).padStart(3, '0') : id.trim();
  const now = new Date();

  try {
    await db
      .update(nfcPlates)
      .set({
        status: 'inactive',
        merchantId: null,
        redirectUrl: null,
        updatedAt: now
      })
      .where(eq(nfcPlates.id, cleanId));
  } catch {}

  const jsonDb = readDbJson();
  const plates: any[] = jsonDb.nfcPlates || [];
  let updated = false;
  for (let i = 0; i < plates.length; i++) {
    if (isSamePlateCode(plates[i].id, cleanId)) {
      updated = true;
      plates[i].status = 'inactive';
      plates[i].merchant_id = null;
      plates[i].merchantId = null;
      plates[i].redirect_url = null;
      plates[i].redirectUrl = null;
      delete plates[i].merchant_name;
      delete plates[i].merchant_slug;
      plates[i].updatedAt = now.toISOString();
    }
  }
  if (updated) {
    jsonDb.nfcPlates = plates;
    writeDbJson(jsonDb);
  }

  return true;
}

export async function deleteNfcPlateSql(id: string): Promise<boolean> {
  const cleanId = id.trim();
  try {
    await db.delete(nfcPlates).where(eq(nfcPlates.id, cleanId));
  } catch {}

  const jsonDb = readDbJson();
  jsonDb.nfcPlates = (jsonDb.nfcPlates || []).filter((p: any) => !isSamePlateCode(p.id, cleanId));
  writeDbJson(jsonDb);
  return true;
}

export async function incrementNfcScanSql(id: string): Promise<void> {
  const cleanId = id.trim();
  try {
    const plate = await getNfcPlateByIdSql(cleanId);
    if (plate) {
      await db
        .update(nfcPlates)
        .set({
          scanCount: (plate.scan_count || 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(nfcPlates.id, plate.id));
    }
  } catch {}

  const jsonDb = readDbJson();
  const plates: any[] = jsonDb.nfcPlates || [];
  const idx = plates.findIndex((p: any) => isSamePlateCode(p.id, cleanId));
  if (idx >= 0) {
    const curr = Number(plates[idx].scan_count || plates[idx].scanCount || 0);
    plates[idx].scan_count = curr + 1;
    plates[idx].scanCount = curr + 1;
    plates[idx].updatedAt = new Date().toISOString();
    jsonDb.nfcPlates = plates;
    writeDbJson(jsonDb);
  }
}
