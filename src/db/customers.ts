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
    const result = await db
      .insert(customers)
      .values({
        id,
        businessId: data.businessId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        reviewsCount: data.reviewsCount || 1,
        lastReviewAt: data.lastReviewAt ? new Date(data.lastReviewAt) : new Date(),
        avgRating: data.avgRating || 5,
        status: data.status || 'active',
        internalNotes: data.internalNotes || null,
        lastInteractionAt: data.lastInteractionAt ? new Date(data.lastInteractionAt) : new Date(),
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          reviewsCount: data.reviewsCount,
          lastReviewAt: data.lastReviewAt ? new Date(data.lastReviewAt) : new Date(),
          avgRating: data.avgRating,
          status: data.status,
          internalNotes: data.internalNotes,
          lastInteractionAt: data.lastInteractionAt ? new Date(data.lastInteractionAt) : new Date(),
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
