import { db } from './index.ts';
import { reviews } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

const inMemoryReviews: any[] = [];

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
    console.warn('Database query failed in getReviewsSql, returning in-memory reviews:', error);
    if (businessId) {
      return inMemoryReviews.filter((r) => r.businessId === businessId || r.business_id === businessId);
    }
    return inMemoryReviews;
  }
}

export async function createReviewSql(data: any) {
  const id = data.id || `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const bizId = data.businessId || data.business_id;
  if (!bizId) {
    throw new Error('businessId / business_id é obrigatório para registrar a avaliação');
  }

  const reviewRecord = {
    id,
    businessId: bizId,
    business_id: bizId,
    customerId: data.customerId || data.customer_id || null,
    customerName: data.customerName || data.customer_name || 'Cliente',
    customerPhone: data.customerPhone || data.customer_phone || null,
    customerEmail: data.customerEmail || data.customer_email || null,
    rating: Number(data.rating),
    channel: (data.channel || 'qr').toLowerCase(),
    createdAt: data.createdAt || data.created_at ? new Date(data.createdAt || data.created_at) : new Date()
  };

  try {
    const result = await db
      .insert(reviews)
      .values({
        id,
        businessId: bizId,
        customerId: reviewRecord.customerId,
        customerName: reviewRecord.customerName,
        customerPhone: reviewRecord.customerPhone,
        customerEmail: reviewRecord.customerEmail,
        rating: reviewRecord.rating,
        channel: reviewRecord.channel,
        createdAt: reviewRecord.createdAt
      })
      .returning();

    const saved = result[0] || reviewRecord;
    inMemoryReviews.unshift(saved);
    return saved;
  } catch (error) {
    console.warn('Database insert failed in createReviewSql, using in-memory store:', error);
    inMemoryReviews.unshift(reviewRecord);
    return reviewRecord;
  }
}

export async function deleteReviewSql(id: string) {
  try {
    const idx = inMemoryReviews.findIndex((r) => r.id === id);
    if (idx !== -1) inMemoryReviews.splice(idx, 1);
    return await db.delete(reviews).where(eq(reviews.id, id));
  } catch (error) {
    console.warn('Database delete failed in deleteReviewSql:', error);
    return { success: true };
  }
}

export async function clearReviewsSql(businessId?: string) {
  try {
    if (businessId) {
      for (let i = inMemoryReviews.length - 1; i >= 0; i--) {
        if (inMemoryReviews[i].businessId === businessId || inMemoryReviews[i].business_id === businessId) {
          inMemoryReviews.splice(i, 1);
        }
      }
      return await db.delete(reviews).where(eq(reviews.businessId, businessId));
    }
    inMemoryReviews.length = 0;
    return await db.delete(reviews);
  } catch (error) {
    console.warn('Database clear failed in clearReviewsSql:', error);
    return { success: true };
  }
}
