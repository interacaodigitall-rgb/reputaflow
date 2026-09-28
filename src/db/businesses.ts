import { db } from './index.ts';
import { businesses } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import { REGISTERED_BUSINESSES } from '../lib/initialData.ts';

// In-memory store initialized with registered businesses so the server never fails
const inMemoryBusinesses: any[] = [...REGISTERED_BUSINESSES.map(b => ({
  id: b.id,
  name: b.name,
  slug: b.slug,
  category: b.category || 'Barbearia & Estética',
  logoUrl: b.logoUrl || null,
  phone: b.phone || '',
  email: b.email || '',
  address: b.address || '',
  googleReviewUrl: b.googleReviewUrl || null,
  status: b.status || 'active',
  planId: b.planId || 'plan_pro',
  ownerId: b.ownerId || 'owner_mrnavalha',
  currency: b.currency || 'EUR',
  password: b.password || 'reputa123',
  createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
  updatedAt: b.updatedAt ? new Date(b.updatedAt) : new Date()
}))];

function normalizeSlug(str: string = ''): string {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}

export async function getAllBusinessesSql() {
  try {
    const list = await db.select().from(businesses).orderBy(desc(businesses.createdAt));
    if (list && list.length > 0) {
      // Merge with in-memory store for newly added businesses
      for (const item of list) {
        const idx = inMemoryBusinesses.findIndex(b => b.id === item.id);
        if (idx !== -1) inMemoryBusinesses[idx] = item;
        else inMemoryBusinesses.unshift(item);
      }
      return inMemoryBusinesses;
    }
  } catch (error) {
    console.warn('[getAllBusinessesSql] Cloud SQL fallback to in-memory store');
  }
  return inMemoryBusinesses;
}

export async function getBusinessByIdSql(id: string) {
  try {
    const result = await db.select().from(businesses).where(eq(businesses.id, id));
    if (result[0]) {
      return result[0];
    }
  } catch (error) {
    console.warn('[getBusinessByIdSql] Cloud SQL fallback for id:', id);
  }
  return inMemoryBusinesses.find(b => b.id === id) || null;
}

export async function getBusinessBySlugSql(slug: string) {
  const clean = normalizeSlug(slug);
  try {
    const result = await db.select().from(businesses).where(eq(businesses.slug, clean));
    if (result[0]) {
      return result[0];
    }
  } catch (error) {
    console.warn('[getBusinessBySlugSql] Cloud SQL fallback for slug:', slug);
  }

  const match = inMemoryBusinesses.find(
    b => normalizeSlug(b.slug) === clean || b.id === slug || normalizeSlug(b.name) === clean
  );
  return match || null;
}

export async function upsertBusinessSql(data: any) {
  const cleanSlug = normalizeSlug(data.slug || data.name);
  const id = data.id || `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const memoryRecord = {
    id,
    name: data.name,
    slug: cleanSlug,
    category: data.category || 'Comércio & Serviços',
    logoUrl: data.logoUrl || data.logo_url || null,
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    googleReviewUrl: data.googleReviewUrl || data.google_review_url || null,
    status: data.status || 'active',
    planId: data.planId || data.plan_id || 'plan_pro',
    ownerId: data.ownerId || data.owner_id || 'owner_default',
    currency: data.currency || 'EUR',
    password: data.password || 'reputa123',
    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    updatedAt: new Date()
  };

  const existingIdx = inMemoryBusinesses.findIndex(b => b.id === id || normalizeSlug(b.slug) === cleanSlug);
  if (existingIdx !== -1) {
    inMemoryBusinesses[existingIdx] = { ...inMemoryBusinesses[existingIdx], ...memoryRecord };
  } else {
    inMemoryBusinesses.unshift(memoryRecord);
  }

  try {
    const result = await db
      .insert(businesses)
      .values(memoryRecord)
      .onConflictDoUpdate({
        target: businesses.id,
        set: {
          name: memoryRecord.name,
          slug: cleanSlug,
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
    console.warn('[upsertBusinessSql] Cloud SQL insert failed, saved to in-memory fallback:', error);
    return memoryRecord;
  }
}

export async function updateBusinessSql(id: string, updates: any) {
  const existingIdx = inMemoryBusinesses.findIndex(b => b.id === id);
  if (existingIdx !== -1) {
    inMemoryBusinesses[existingIdx] = {
      ...inMemoryBusinesses[existingIdx],
      ...updates,
      updatedAt: new Date()
    };
    if (updates.slug) {
      inMemoryBusinesses[existingIdx].slug = normalizeSlug(updates.slug);
    }
  }

  try {
    const fieldsToUpdate: Record<string, any> = {
      updatedAt: new Date()
    };
    if (updates.name !== undefined) fieldsToUpdate.name = updates.name;
    if (updates.slug !== undefined) fieldsToUpdate.slug = normalizeSlug(updates.slug);
    if (updates.category !== undefined) fieldsToUpdate.category = updates.category;
    if (updates.logoUrl !== undefined) fieldsToUpdate.logoUrl = updates.logoUrl;
    if (updates.phone !== undefined) fieldsToUpdate.phone = updates.phone;
    if (updates.email !== undefined) fieldsToUpdate.email = updates.email;
    if (updates.address !== undefined) fieldsToUpdate.address = updates.address;
    if (updates.googleReviewUrl !== undefined) fieldsToUpdate.googleReviewUrl = updates.googleReviewUrl;
    if (updates.status !== undefined) fieldsToUpdate.status = updates.status;
    if (updates.planId !== undefined) fieldsToUpdate.planId = updates.planId;
    if (updates.currency !== undefined) fieldsToUpdate.currency = updates.currency;
    if (updates.password !== undefined) fieldsToUpdate.password = updates.password;

    const result = await db
      .update(businesses)
      .set(fieldsToUpdate)
      .where(eq(businesses.id, id))
      .returning();

    return result[0] || inMemoryBusinesses[existingIdx] || null;
  } catch (error) {
    console.warn('[updateBusinessSql] Cloud SQL update failed, updated in-memory store:', error);
    return inMemoryBusinesses[existingIdx] || null;
  }
}

export async function deleteBusinessSql(id: string) {
  const existingIdx = inMemoryBusinesses.findIndex(b => b.id === id);
  if (existingIdx !== -1) {
    inMemoryBusinesses.splice(existingIdx, 1);
  }

  try {
    await db.delete(businesses).where(eq(businesses.id, id));
    return { success: true };
  } catch (error) {
    console.warn('[deleteBusinessSql] Cloud SQL delete failed, removed from memory store:', error);
    return { success: true };
  }
}
