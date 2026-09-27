import { db } from './index.ts';
import { recoveryCases } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

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
    console.error('Database query failed in getRecoveryCasesSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function createRecoveryCaseSql(data: any) {
  try {
    const id = data.id || `rec_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const result = await db
      .insert(recoveryCases)
      .values({
        id,
        businessId: data.businessId || data.business_id,
        customerId: data.customerId || data.customer_id || null,
        reviewId: data.reviewId || data.review_id,
        feedbackId: data.feedbackId || data.feedback_id || null,
        customerName: data.customerName || data.customer_name || 'Cliente',
        customerPhone: data.customerPhone || data.customer_phone || '',
        customerEmail: data.customerEmail || data.customer_email || null,
        rating: Number(data.rating),
        status: data.status || 'novo',
        notes: data.notes || null,
        assignedTo: data.assignedTo || data.assigned_to || null,
        createdAt: data.createdAt || data.created_at ? new Date(data.createdAt || data.created_at) : new Date(),
        updatedAt: new Date()
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in createRecoveryCaseSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function updateRecoveryCaseSql(id: string, updates: any) {
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

    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in updateRecoveryCaseSql:', error);
    throw new Error('Database operation failed', { cause: error });
  }
}
