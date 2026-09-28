import { db } from './index.ts';
import { recoveryCases } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

const inMemoryRecoveryCases: any[] = [];

export async function getRecoveryCasesSql(businessId?: string) {
  try {
    if (businessId) {
      return await db
        .select()
        .from(recoveryCases)
        .where(eq(recoveryCases.businessId, businessId))
        .orderBy(desc(recoveryCases.createdAt));
    }
    return await db.select().from(recoveryCases).orderBy(desc(recoveryCases.createdAt));
  } catch (error) {
    console.warn('Database query failed in getRecoveryCasesSql, using in-memory store:', error);
    if (businessId) {
      return inMemoryRecoveryCases.filter((c) => c.businessId === businessId || c.business_id === businessId);
    }
    return inMemoryRecoveryCases;
  }
}

export async function createRecoveryCaseSql(data: any) {
  const id = data.id || `rec_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const bizId = data.businessId || data.business_id;
  const custId = data.customerId || data.customer_id || null;
  const revId = data.reviewId || data.review_id;
  const fbId = data.feedbackId || data.feedback_id || null;
  const custName = data.customerName || data.customer_name || 'Cliente';
  const custPhone = data.customerPhone || data.customer_phone || '';
  const custEmail = data.customerEmail || data.customer_email || null;
  const rating = Number(data.rating || 1);
  const status = data.status || 'novo';
  const notes = data.notes || null;
  const assignedTo = data.assignedTo || data.assigned_to || null;
  const createdAt = data.createdAt || data.created_at ? new Date(data.createdAt || data.created_at) : new Date();
  const updatedAt = new Date();

  const record = {
    id,
    businessId: bizId,
    business_id: bizId,
    customerId: custId,
    customer_id: custId,
    reviewId: revId,
    review_id: revId,
    feedbackId: fbId,
    feedback_id: fbId,
    customerName: custName,
    customer_name: custName,
    customerPhone: custPhone,
    customer_phone: custPhone,
    customerEmail: custEmail,
    customer_email: custEmail,
    rating,
    status,
    notes,
    assignedTo,
    assigned_to: assignedTo,
    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt
  };

  try {
    const result = await db
      .insert(recoveryCases)
      .values({
        id,
        businessId: bizId,
        customerId: custId,
        reviewId: revId,
        feedbackId: fbId,
        customerName: custName,
        customerPhone: custPhone,
        customerEmail: custEmail,
        rating,
        status,
        notes,
        assignedTo,
        createdAt,
        updatedAt
      })
      .returning();

    const saved = result[0] || record;
    inMemoryRecoveryCases.unshift(saved);
    return saved;
  } catch (error) {
    console.warn('Database insert failed in createRecoveryCaseSql, using in-memory store:', error);
    inMemoryRecoveryCases.unshift(record);
    return record;
  }
}

export async function updateRecoveryCaseSql(id: string, updates: any) {
  const inMemIndex = inMemoryRecoveryCases.findIndex((c) => c.id === id);
  if (inMemIndex !== -1) {
    inMemoryRecoveryCases[inMemIndex] = {
      ...inMemoryRecoveryCases[inMemIndex],
      ...updates,
      updatedAt: new Date(),
      updated_at: new Date()
    };
  }

  try {
    const result = await db
      .update(recoveryCases)
      .set({
        ...updates,
        resolvedAt: updates.status === 'resolvido' || updates.status === 'cliente_recuperado' ? new Date() : undefined,
        updatedAt: new Date()
      })
      .where(eq(recoveryCases.id, id))
      .returning();

    return result[0] || (inMemIndex !== -1 ? inMemoryRecoveryCases[inMemIndex] : null);
  } catch (error) {
    console.warn('Database update failed in updateRecoveryCaseSql, using in-memory store:', error);
    return inMemIndex !== -1 ? inMemoryRecoveryCases[inMemIndex] : null;
  }
}
