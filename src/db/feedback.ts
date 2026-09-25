import { db } from './index.ts';
import { feedback } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getFeedbackSql(businessId?: string) {
  try {
    if (businessId) {
      return await db
        .select()
        .from(feedback)
        .where(eq(feedback.businessId, businessId))
        .orderBy(desc(feedback.createdAt));
    }
    return await db.select().from(feedback).orderBy(desc(feedback.createdAt));
  } catch (error) {
    console.error('Database query failed in getFeedbackSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function createFeedbackSql(data: any) {
  try {
    const id = data.id || `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const result = await db
      .insert(feedback)
      .values({
        id,
        businessId: data.businessId,
        reviewId: data.reviewId,
        customerId: data.customerId || null,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail || null,
        rating: data.rating,
        question1: data.question1,
        question2: data.question2,
        question3WantsContact: Boolean(data.question3WantsContact),
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in createFeedbackSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}
