import { db } from './index.ts';
import { customers } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

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
    console.error('Database query failed in getCustomersSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function upsertCustomerSql(data: any) {
  try {
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
        createdAt: data.createdAt || data.created_at ? new Date(data.createdAt || data.created_at) : new Date(),
        updatedAt: new Date()
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
          updatedAt: new Date()
        }
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertCustomerSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}
