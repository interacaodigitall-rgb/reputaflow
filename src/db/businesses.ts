import { db } from './index.ts';
import {
  businesses,
  customers,
  reviews,
  feedback,
  recoveryCases,
  interactions,
  nfcPlates
} from './schema.ts';
import { eq, desc, or } from 'drizzle-orm';
import { REGISTERED_BUSINESSES } from '../lib/initialData.ts';
import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

export function readDbJson(): any {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed) return parsed;
    }
  } catch (e) {
    console.warn('[readDbJson notice in businesses.ts]:', e);
  }
  return {
    businesses: [],
    deletedBusinessIds: [],
    customers: [],
    reviews: [],
    feedback: [],
    recoveryCases: [],
    nfcPlates: []
  };
}

export function writeDbJson(data: any): void {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[writeDbJson notice in businesses.ts]:', e);
  }
}

function normalizeSlug(str: string = ''): string {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeNameKey(str: string = ''): string {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getDeletedSet(jsonDb?: any): Set<string> {
  const data = jsonDb || readDbJson();
  const arr = Array.isArray(data.deletedBusinessIds) ? data.deletedBusinessIds : [];
  return new Set(arr.map((x: any) => String(x || '').toLowerCase().trim()).filter(Boolean));
}

function isDeletedRecord(b: any, deletedSet: Set<string>): boolean {
  if (!b) return true;
  const idKey = String(b.id || '').toLowerCase().trim();
  const slugKey = normalizeSlug(b.slug || '');
  const nameKey = normalizeNameKey(b.name || '');
  return Boolean(
    (idKey && deletedSet.has(idKey)) ||
    (slugKey && deletedSet.has(slugKey)) ||
    (nameKey && deletedSet.has(nameKey))
  );
}

function getInitialBusinesses(): any[] {
  const jsonDb = readDbJson();
  const deletedSet = getDeletedSet(jsonDb);
  const bySlugOrName = new Map<string, any>();

  REGISTERED_BUSINESSES.forEach((b) => {
    if (isDeletedRecord(b, deletedSet)) return;
    const key = normalizeSlug(b.slug) || normalizeNameKey(b.name) || b.id;
    bySlugOrName.set(key, {
      id: b.id,
      name: b.name,
      slug: b.slug,
      category: b.category || 'Comércio & Serviços',
      logoUrl: b.logoUrl || null,
      phone: b.phone || '',
      email: b.email || '',
      address: b.address || '',
      googleReviewUrl: b.googleReviewUrl || null,
      status: b.status || 'active',
      planId: b.planId || 'plan_pro',
      ownerId: b.ownerId || 'owner_default',
      currency: b.currency || 'EUR',
      password: b.password || 'reputa123',
      createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
      updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date()
    });
  });

  if (Array.isArray(jsonDb.businesses)) {
    jsonDb.businesses.forEach((b: any) => {
      if (!b || !b.name || isDeletedRecord(b, deletedSet)) return;
      const key = normalizeSlug(b.slug) || normalizeNameKey(b.name) || b.id;
      const existing = bySlugOrName.get(key);
      bySlugOrName.set(key, {
        ...(existing || {}),
        ...b,
        id: existing?.id || b.id,
        logoUrl: b.logoUrl || existing?.logoUrl || null,
        googleReviewUrl: b.googleReviewUrl || existing?.googleReviewUrl || null,
        phone: b.phone || existing?.phone || '',
        address: b.address || existing?.address || '',
        createdAt: b.createdAt ? new Date(b.createdAt) : existing?.createdAt || new Date(),
        updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date()
      });
    });
  }

  return Array.from(bySlugOrName.values());
}

let inMemoryBusinesses: any[] = getInitialBusinesses();

export async function getAllBusinessesSql() {
  const jsonDb = readDbJson();
  const deletedSet = getDeletedSet(jsonDb);
  const dedupMap = new Map<string, any>();

  const addRecord = (item: any) => {
    if (!item || !item.name || isDeletedRecord(item, deletedSet)) return;
    // Group by normalized name or slug to prevent duplicates (e.g. local SBK BARBERSHOP vs DB SBK BARBERSHOP)
    const slugKey = normalizeSlug(item.slug || item.name);
    const nameKey = normalizeNameKey(item.name);
    let matchKey = slugKey || item.id;

    for (const [k, v] of dedupMap.entries()) {
      if (
        v.id === item.id ||
        normalizeSlug(v.slug) === slugKey ||
        normalizeNameKey(v.name) === nameKey
      ) {
        matchKey = k;
        break;
      }
    }

    const existing = dedupMap.get(matchKey);
    const normalizedItem = {
      ...item,
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
    };

    if (!existing) {
      dedupMap.set(matchKey, normalizedItem);
    } else {
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const itemTime = normalizedItem.updatedAt ? new Date(normalizedItem.updatedAt).getTime() : 0;
      const winner = itemTime >= existingTime ? normalizedItem : existing;
      const loser = itemTime >= existingTime ? existing : normalizedItem;

      dedupMap.set(matchKey, {
        ...loser,
        ...winner,
        id: existing.id,
        logoUrl: winner.logoUrl || loser.logoUrl || null,
        googleReviewUrl: winner.googleReviewUrl || loser.googleReviewUrl || null,
        phone: winner.phone || loser.phone || '',
        address: winner.address || loser.address || '',
        email: winner.email || loser.email || ''
      });
    }
  };

  REGISTERED_BUSINESSES.forEach(addRecord);
  inMemoryBusinesses.forEach(addRecord);
  if (Array.isArray(jsonDb.businesses)) {
    jsonDb.businesses.forEach(addRecord);
  }

  try {
    const list = await db.select().from(businesses).orderBy(desc(businesses.createdAt));
    if (list && list.length > 0) {
      list.forEach(addRecord);
    }
  } catch (error) {
    console.warn('[getAllBusinessesSql] Cloud SQL fallback to in-memory store');
  }

  inMemoryBusinesses = Array.from(dedupMap.values());
  return inMemoryBusinesses;
}

export async function getBusinessByIdSql(id: string) {
  const all = await getAllBusinessesSql();
  return all.find((b) => b.id === id) || null;
}

export async function getBusinessBySlugSql(slug: string) {
  const clean = normalizeSlug(slug);
  const cleanName = normalizeNameKey(slug);
  const all = await getAllBusinessesSql();
  return (
    all.find(
      (b) =>
        normalizeSlug(b.slug) === clean ||
        b.id === slug ||
        normalizeNameKey(b.name) === cleanName
    ) || null
  );
}

export async function upsertBusinessSql(data: any) {
  let cleanSlug = normalizeSlug(data.slug || data.name);
  if (!cleanSlug) {
    cleanSlug = `comercio-${Date.now().toString(36)}`;
  }
  const cleanName = normalizeNameKey(data.name || '');

  // Check if a business with the same ID, slug, or normalized name already exists
  const existingMatch = inMemoryBusinesses.find(
    (b) =>
      (data.id && b.id === data.id) ||
      normalizeSlug(b.slug) === cleanSlug ||
      (cleanName && normalizeNameKey(b.name) === cleanName)
  );

  const id =
    existingMatch?.id ||
    data.id ||
    `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const slugToUse = existingMatch?.slug || cleanSlug;

  // Unmark from deletedBusinessIds if it was previously deleted
  try {
    const jsonDb = readDbJson();
    if (Array.isArray(jsonDb.deletedBusinessIds)) {
      const toUnmark = new Set([
        id.toLowerCase(),
        slugToUse.toLowerCase(),
        cleanSlug.toLowerCase(),
        cleanName
      ]);
      jsonDb.deletedBusinessIds = jsonDb.deletedBusinessIds.filter(
        (k: string) => !toUnmark.has(String(k || '').toLowerCase().trim())
      );
      writeDbJson(jsonDb);
    }
  } catch {}

  const memoryRecord = {
    id,
    name: String(data.name || existingMatch?.name || '').trim(),
    slug: slugToUse,
    category: data.category || existingMatch?.category || 'Comércio & Serviços',
    logoUrl: data.logoUrl || data.logo_url || existingMatch?.logoUrl || null,
    phone: data.phone || existingMatch?.phone || '',
    email: data.email || existingMatch?.email || `${slugToUse}@reputaflow.com`,
    address: data.address || existingMatch?.address || '',
    googleReviewUrl:
      data.googleReviewUrl || data.google_review_url || existingMatch?.googleReviewUrl || null,
    status: data.status || existingMatch?.status || 'active',
    planId: data.planId || data.plan_id || existingMatch?.planId || 'plan_pro',
    ownerId: data.ownerId || data.owner_id || existingMatch?.ownerId || 'owner_default',
    currency: data.currency || existingMatch?.currency || 'EUR',
    password: data.password || existingMatch?.password || 'reputa123',
    createdAt: data.createdAt
      ? new Date(data.createdAt)
      : existingMatch?.createdAt
      ? new Date(existingMatch.createdAt)
      : new Date(),
    updatedAt: new Date()
  };

  const existingIdx = inMemoryBusinesses.findIndex(
    (b) =>
      b.id === id ||
      normalizeSlug(b.slug) === slugToUse ||
      (cleanName && normalizeNameKey(b.name) === cleanName)
  );
  if (existingIdx !== -1) {
    inMemoryBusinesses[existingIdx] = { ...inMemoryBusinesses[existingIdx], ...memoryRecord };
  } else {
    inMemoryBusinesses.unshift(memoryRecord);
  }

  try {
    const jsonDb = readDbJson();
    if (!Array.isArray(jsonDb.businesses)) jsonDb.businesses = [];
    const idx = jsonDb.businesses.findIndex(
      (b: any) =>
        b.id === id ||
        normalizeSlug(b.slug) === slugToUse ||
        (cleanName && normalizeNameKey(b.name) === cleanName)
    );
    if (idx !== -1) jsonDb.businesses[idx] = memoryRecord;
    else jsonDb.businesses.unshift(memoryRecord);
    writeDbJson(jsonDb);
  } catch (e) {
    console.warn('[db.json write notice]:', e);
  }

  try {
    const existingBySlug = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, memoryRecord.slug));
    if (existingBySlug.length > 0 && existingBySlug[0].id !== id) {
      // Update existing row in DB with the same slug
      const targetDbId = existingBySlug[0].id;
      const updated = await db
        .update(businesses)
        .set({
          name: memoryRecord.name,
          category: memoryRecord.category,
          logoUrl: memoryRecord.logoUrl,
          phone: memoryRecord.phone,
          email: memoryRecord.email,
          address: memoryRecord.address,
          googleReviewUrl: memoryRecord.googleReviewUrl,
          status: memoryRecord.status,
          planId: memoryRecord.planId,
          currency: memoryRecord.currency,
          password: memoryRecord.password,
          updatedAt: new Date()
        })
        .where(eq(businesses.id, targetDbId))
        .returning();
      return updated[0] || memoryRecord;
    }

    const result = await db
      .insert(businesses)
      .values(memoryRecord)
      .onConflictDoUpdate({
        target: businesses.id,
        set: {
          name: memoryRecord.name,
          slug: memoryRecord.slug,
          category: memoryRecord.category,
          logoUrl: memoryRecord.logoUrl,
          phone: memoryRecord.phone,
          email: memoryRecord.email,
          address: memoryRecord.address,
          googleReviewUrl: memoryRecord.googleReviewUrl,
          status: memoryRecord.status,
          planId: memoryRecord.planId,
          currency: memoryRecord.currency,
          password: memoryRecord.password,
          updatedAt: new Date()
        }
      })
      .returning();

    return result[0] || memoryRecord;
  } catch (error) {
    console.warn('[upsertBusinessSql] Cloud SQL insert fallback:', error);
    return memoryRecord;
  }
}

export async function updateBusinessSql(id: string, updates: any) {
  const cleanId = String(id || '').trim();
  const cleanSlug = updates.slug ? normalizeSlug(updates.slug) : '';

  let existingIdx = inMemoryBusinesses.findIndex(
    (b) => b.id === cleanId || normalizeSlug(b.slug) === normalizeSlug(cleanId)
  );
  if (existingIdx === -1 && cleanSlug) {
    existingIdx = inMemoryBusinesses.findIndex((b) => normalizeSlug(b.slug) === cleanSlug);
  }

  const safeUpdates = { ...updates };
  delete safeUpdates.id;
  delete safeUpdates.tenant_id;
  delete safeUpdates.createdAt;
  delete safeUpdates.created_at;

  const resolvedId = existingIdx !== -1 ? inMemoryBusinesses[existingIdx].id : cleanId;

  if (existingIdx !== -1) {
    inMemoryBusinesses[existingIdx] = {
      ...inMemoryBusinesses[existingIdx],
      ...safeUpdates,
      status: safeUpdates.status || inMemoryBusinesses[existingIdx].status || 'active',
      updatedAt: new Date()
    };
    if (cleanSlug) {
      inMemoryBusinesses[existingIdx].slug = cleanSlug;
    }
  }

  try {
    const jsonDb = readDbJson();
    if (Array.isArray(jsonDb.businesses)) {
      let idx = jsonDb.businesses.findIndex(
        (b: any) => b.id === cleanId || normalizeSlug(b.slug) === normalizeSlug(cleanId)
      );
      if (idx === -1 && cleanSlug) {
        idx = jsonDb.businesses.findIndex((b: any) => normalizeSlug(b.slug) === cleanSlug);
      }
      if (idx !== -1) {
        jsonDb.businesses[idx] = {
          ...jsonDb.businesses[idx],
          ...safeUpdates,
          status: safeUpdates.status || jsonDb.businesses[idx].status || 'active',
          updatedAt: new Date()
        };
        if (cleanSlug) jsonDb.businesses[idx].slug = cleanSlug;
        writeDbJson(jsonDb);
      }
    }
  } catch {}

  try {
    const fieldsToUpdate: Record<string, any> = {
      updatedAt: new Date()
    };
    if (safeUpdates.name !== undefined) fieldsToUpdate.name = safeUpdates.name;
    if (cleanSlug) fieldsToUpdate.slug = cleanSlug;
    if (safeUpdates.category !== undefined) fieldsToUpdate.category = safeUpdates.category;
    if (safeUpdates.logoUrl !== undefined) fieldsToUpdate.logoUrl = safeUpdates.logoUrl;
    if (safeUpdates.phone !== undefined) fieldsToUpdate.phone = safeUpdates.phone;
    if (safeUpdates.email !== undefined) fieldsToUpdate.email = safeUpdates.email;
    if (safeUpdates.address !== undefined) fieldsToUpdate.address = safeUpdates.address;
    if (safeUpdates.googleReviewUrl !== undefined)
      fieldsToUpdate.googleReviewUrl = safeUpdates.googleReviewUrl;
    if (safeUpdates.status !== undefined) fieldsToUpdate.status = safeUpdates.status;
    if (safeUpdates.planId !== undefined) fieldsToUpdate.planId = safeUpdates.planId;
    if (safeUpdates.currency !== undefined) fieldsToUpdate.currency = safeUpdates.currency;
    if (safeUpdates.password !== undefined) fieldsToUpdate.password = safeUpdates.password;

    const result = await db
      .update(businesses)
      .set(fieldsToUpdate)
      .where(eq(businesses.id, resolvedId))
      .returning();

    return result[0] || (existingIdx !== -1 ? inMemoryBusinesses[existingIdx] : null);
  } catch (error) {
    console.warn('[updateBusinessSql] Cloud SQL update fallback:', error);
    return existingIdx !== -1 ? inMemoryBusinesses[existingIdx] : null;
  }
}

export async function deleteBusinessSql(id: string) {
  const cleanId = String(id || '').trim();
  const target = inMemoryBusinesses.find(
    (b) => b.id === cleanId || normalizeSlug(b.slug) === normalizeSlug(cleanId)
  );
  const targetSlug = target ? normalizeSlug(target.slug) : normalizeSlug(cleanId);
  const targetNameKey = target ? normalizeNameKey(target.name) : '';
  const allMatchingIds = inMemoryBusinesses
    .filter(
      (b) =>
        b.id === cleanId ||
        (targetSlug && normalizeSlug(b.slug) === targetSlug) ||
        (targetNameKey && normalizeNameKey(b.name) === targetNameKey)
    )
    .map((b) => b.id);

  if (!allMatchingIds.includes(cleanId)) {
    allMatchingIds.push(cleanId);
  }

  // 1. Remove from inMemoryBusinesses
  inMemoryBusinesses = inMemoryBusinesses.filter(
    (b) =>
      !allMatchingIds.includes(b.id) &&
      (!targetSlug || normalizeSlug(b.slug) !== targetSlug) &&
      (!targetNameKey || normalizeNameKey(b.name) !== targetNameKey)
  );

  // 2. Persist tombstone in data/db.json and unlink any NFC plates pointing to this business
  try {
    const jsonDb = readDbJson();
    const deletedSet = getDeletedSet(jsonDb);
    allMatchingIds.forEach((mId) => deletedSet.add(String(mId).toLowerCase().trim()));
    if (targetSlug) deletedSet.add(targetSlug);
    if (targetNameKey) deletedSet.add(targetNameKey);
    jsonDb.deletedBusinessIds = Array.from(deletedSet);

    if (Array.isArray(jsonDb.businesses)) {
      jsonDb.businesses = jsonDb.businesses.filter(
        (b: any) => !isDeletedRecord(b, deletedSet)
      );
    }

    if (Array.isArray(jsonDb.nfcPlates)) {
      jsonDb.nfcPlates = jsonDb.nfcPlates.map((p: any) => {
        const pMid = String(p.merchant_id || p.merchantId || '').toLowerCase().trim();
        const pSlug = normalizeSlug(p.merchant_slug || p.merchantSlug || '');
        const pRedir = String(p.redirect_url || p.redirectUrl || '').toLowerCase();
        if (
          deletedSet.has(pMid) ||
          (pSlug && deletedSet.has(pSlug)) ||
          (targetSlug && pRedir.includes(targetSlug))
        ) {
          return {
            ...p,
            status: 'inactive',
            merchant_id: null,
            merchantId: null,
            redirect_url: null,
            redirectUrl: null,
            merchant_name: undefined,
            merchant_slug: undefined,
            updatedAt: new Date().toISOString()
          };
        }
        return p;
      });
    }

    writeDbJson(jsonDb);
  } catch (e) {
    console.warn('[deleteBusinessSql db.json notice]:', e);
  }

  // 3. Delete from Cloud SQL PostgreSQL (dependent rows + business + unlink plates)
  for (const bId of allMatchingIds) {
    try {
      await db.delete(interactions).where(eq(interactions.businessId, bId));
    } catch {}
    try {
      await db.delete(recoveryCases).where(eq(recoveryCases.businessId, bId));
    } catch {}
    try {
      await db.delete(feedback).where(eq(feedback.businessId, bId));
    } catch {}
    try {
      await db.delete(reviews).where(eq(reviews.businessId, bId));
    } catch {}
    try {
      await db.delete(customers).where(eq(customers.businessId, bId));
    } catch {}
    try {
      await db
        .update(nfcPlates)
        .set({ status: 'inactive', merchantId: null, redirectUrl: null, updatedAt: new Date() })
        .where(eq(nfcPlates.merchantId, bId));
    } catch {}
    try {
      await db.delete(businesses).where(eq(businesses.id, bId));
    } catch {}
  }

  if (targetSlug) {
    try {
      await db.delete(businesses).where(eq(businesses.slug, targetSlug));
    } catch {}
  }

  return { success: true, deletedIds: allMatchingIds };
}
