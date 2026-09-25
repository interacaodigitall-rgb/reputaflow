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
        businessId: data.businessId,
        customerId: data.customerId || null,
        reviewId: data.reviewId,
        feedbackId: data.feedbackId || null,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || null,
        rating: data.rating,
        status: data.status || 'novo',
        notes: data.notes || null,
        assignedTo: data.assignedTo || null,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
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
