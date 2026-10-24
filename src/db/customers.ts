import { db } from './index.ts';
import { customers } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import { INITIAL_CUSTOMERS } from '../lib/initialData.ts';
import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'data', 'db.json');

function getInitialCustomers() {
  const map = new Map<string, any>();
  INITIAL_CUSTOMERS.forEach((c) => {
    map.set(c.id, {
      ...c,
      business_id: c.businessId,
      reviews_count: c.reviewsCount,
      last_review_at: new Date(c.lastReviewAt),
      avg_rating: c.avgRating,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt || c.createdAt)
    });
  });

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const json = JSON.parse(raw);
      if (json && Array.isArray(json.customers)) {
        json.customers.forEach((c: any) => {
          map.set(c.id, {
            ...c,
            business_id: c.businessId || c.business_id,
            reviews_count: c.reviewsCount || c.reviews_count || 1,
            last_review_at: new Date(c.lastReviewAt || c.last_review_at || Date.now()),
            avg_rating: c.avgRating || c.avg_rating || 5,
            createdAt: new Date(c.createdAt || c.created_at || Date.now()),
            updatedAt: new Date(c.updatedAt || c.updated_at || Date.now())
          });
        });
      }
    }
  } catch (e) {}

  return Array.from(map.values());
}

const inMemoryCustomers: any[] = getInitialCustomers();

export async function getCustomersSql(businessId?: string) {
  let list: any[] = [];
  try {
    if (businessId) {
      list = await db
        .select()
        .from(customers)
        .where(eq(customers.businessId, businessId))
        .orderBy(desc(customers.lastReviewAt));
    } else {
      list = await db.select().from(customers).orderBy(desc(customers.lastReviewAt));
    }
  } catch (error) {
    console.warn('Database query failed in getCustomersSql, using in-memory store:', error);
  }

  const map = new Map<string, any>();
  inMemoryCustomers.forEach((c) => map.set(c.id, c));
  list.forEach((c) => map.set(c.id, c));

  const all = Array.from(map.values());
  if (businessId) {
    return all.filter((c) => c.businessId === businessId || c.business_id === businessId);
  }
  return all;
}

export async function upsertCustomerSql(data: any) {
  const id = data.id || `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const bizId = data.businessId || data.business_id;
  const custName = data.name || data.customerName || data.customer_name || 'Cliente';
  const custPhone = data.phone || data.customerPhone || data.customer_phone || '';
  const custEmail = data.email || data.customerEmail || data.customer_email || null;
  const revCount = data.reviewsCount || data.reviews_count || 1;
  const lastRevAt = data.lastReviewAt || data.last_review_at ? new Date(data.lastReviewAt || data.last_review_at) : new Date();
  const rating = data.avgRating || data.avg_rating || data.rating || 5;
  const custStatus = data.status || 'active';
  const notes = data.internalNotes || data.internal_notes || data.notes || null;
  const lastInteract = data.lastInteractionAt || data.last_interaction_at ? new Date(data.lastInteractionAt || data.last_interaction_at) : new Date();
  const createdAt = data.createdAt || data.created_at ? new Date(data.createdAt || data.created_at) : new Date();
  const updatedAt = new Date();

  const record = {
    id,
    businessId: bizId,
    business_id: bizId,
    name: custName,
    phone: custPhone,
    email: custEmail,
    reviewsCount: revCount,
    reviews_count: revCount,
    lastReviewAt: lastRevAt,
    last_review_at: lastRevAt,
    avgRating: Number(rating),
    avg_rating: Number(rating),
    status: custStatus,
    internalNotes: notes,
    internal_notes: notes,
    lastInteractionAt: lastInteract,
    last_interaction_at: lastInteract,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt
  };

  const existingIdx = inMemoryCustomers.findIndex(
    (c) => (c.id === id) || (c.phone && custPhone && c.phone === custPhone && (c.businessId === bizId || c.business_id === bizId))
  );
  if (existingIdx !== -1) {
    inMemoryCustomers[existingIdx] = { ...inMemoryCustomers[existingIdx], ...record, reviewsCount: (inMemoryCustomers[existingIdx].reviewsCount || 1) + 1 };
  } else {
    inMemoryCustomers.unshift(record);
  }

  try {
    const result = await db
      .insert(customers)
      .values({
        id,
        businessId: bizId,
        name: custName,
        phone: custPhone,
        email: custEmail,
        reviewsCount: revCount,
        lastReviewAt: lastRevAt,
        avgRating: Number(rating),
        status: custStatus,
        internalNotes: notes,
        lastInteractionAt: lastInteract,
        createdAt,
        updatedAt
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: custName,
          phone: custPhone,
          email: custEmail,
          reviewsCount: revCount,
          lastReviewAt: lastRevAt,
          avgRating: Number(rating),
          status: custStatus,
          internalNotes: notes,
          lastInteractionAt: lastInteract,
          updatedAt
        }
      })
      .returning();

    return result[0] || record;
  } catch (error) {
    console.warn('Database upsert failed in upsertCustomerSql, using in-memory store:', error);
    return record;
  }
}
