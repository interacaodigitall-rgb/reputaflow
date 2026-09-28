import { db } from './index.ts';
import { customers } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

const inMemoryCustomers: any[] = [];

export async function getCustomersSql(businessId?: string) {
  try {
    if (businessId) {
      return await db
        .select()
        .from(customers)
        .where(eq(customers.businessId, businessId))
        .orderBy(desc(customers.lastReviewAt));
    }
    return await db.select().from(customers).orderBy(desc(customers.lastReviewAt));
  } catch (error) {
    console.warn('Database query failed in getCustomersSql, using in-memory store:', error);
    if (businessId) {
      return inMemoryCustomers.filter((c) => c.businessId === businessId || c.business_id === businessId);
    }
    return inMemoryCustomers;
  }
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
