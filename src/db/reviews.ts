import { db } from './index.ts';
import { reviews } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getReviewsSql(businessId?: string) {
  try {
    if (businessId) {
      return await db
        .select()
        .from(reviews)
        .where(eq(reviews.businessId, businessId))
        .orderBy(desc(reviews.createdAt));
    }
    return await db.select().from(reviews).orderBy(desc(reviews.createdAt));
  } catch (error) {
    console.error('Database query failed in getReviewsSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function createReviewSql(data: any) {
  try {
    const id = data.id || `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const result = await db
      .insert(reviews)
      .values({
        id,
        businessId: data.businessId,
        customerId: data.customerId || null,
        customerName: data.customerName || null,
        customerPhone: data.customerPhone || null,
        customerEmail: data.customerEmail || null,
        rating: data.rating,
        channel: data.channel || 'qr',
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in createReviewSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function deleteReviewSql(id: string) {
  try {
    return await db.delete(reviews).where(eq(reviews.id, id));
  } catch (error) {
    console.error('Database delete failed in deleteReviewSql:', error);
    throw new Error('Database delete failed', { cause: error });
  }
}

export async function clearReviewsSql(businessId?: string) {
  try {
    if (businessId) {
      return await db.delete(reviews).where(eq(reviews.businessId, businessId));
    }
    return await db.delete(reviews);
  } catch (error) {
    console.error('Database delete failed in clearReviewsSql:', error);
    throw new Error('Database delete failed', { cause: error });
  }
}
