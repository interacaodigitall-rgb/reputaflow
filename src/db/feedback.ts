import { db } from './index.ts';
import { feedback } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

const inMemoryFeedback: any[] = [];

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
    console.warn('Database query failed in getFeedbackSql, using in-memory store:', error);
    if (businessId) {
      return inMemoryFeedback.filter((f) => f.businessId === businessId || f.business_id === businessId);
    }
    return inMemoryFeedback;
  }
}

export async function createFeedbackSql(data: any) {
  const id = data.id || `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const bizId = data.businessId || data.business_id || '';
  const revId = data.reviewId || data.review_id || '';
  const custId = data.customerId || data.customer_id || null;
  const custName = data.customerName || data.customer_name || 'Cliente';
  const custPhone = data.customerPhone || data.customer_phone || '';
  const custEmail = data.customerEmail || data.customer_email || null;
  const rating = Number(data.rating || 1);
  const q1 = data.question1 || '';
  const q2 = data.question2 || '';
  const q3 = data.question3WantsContact !== undefined ? Boolean(data.question3WantsContact) : (data.question3_wants_contact !== undefined ? Boolean(data.question3_wants_contact) : true);
  const createdAt = data.createdAt || data.created_at ? new Date(data.createdAt || data.created_at) : new Date();

  const record = {
    id,
    businessId: bizId,
    business_id: bizId,
    reviewId: revId,
    review_id: revId,
    customerId: custId,
    customer_id: custId,
    customerName: custName,
    customer_name: custName,
    customerPhone: custPhone,
    customer_phone: custPhone,
    customerEmail: custEmail,
    customer_email: custEmail,
    rating,
    question1: q1,
    question2: q2,
    question3WantsContact: q3,
    question3_wants_contact: q3,
    createdAt,
    created_at: createdAt
  };

  try {
    const result = await db
      .insert(feedback)
      .values({
        id,
        businessId: bizId,
        reviewId: revId,
        customerId: custId,
        customerName: custName,
        customerPhone: custPhone,
        customerEmail: custEmail,
        rating,
        question1: q1,
        question2: q2,
        question3WantsContact: q3,
        createdAt
      })
      .returning();

    const saved = result[0] || record;
    inMemoryFeedback.unshift(saved);
    return saved;
  } catch (error) {
    console.warn('Database insert failed in createFeedbackSql, using in-memory store:', error);
    inMemoryFeedback.unshift(record);
    return record;
  }
}
