import { db } from './index.ts';
import { interactions } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getInteractionsSql(businessId?: string) {
  try {
    if (businessId) {
      return await db
        .select()
        .from(interactions)
        .where(eq(interactions.businessId, businessId))
        .orderBy(desc(interactions.createdAt));
    }
    return await db.select().from(interactions).orderBy(desc(interactions.createdAt));
  } catch (error) {
    console.error('Database query failed in getInteractionsSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function createInteractionSql(data: any) {
  try {
    const id = data.id || `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const result = await db
      .insert(interactions)
      .values({
        id,
        businessId: data.businessId,
        customerId: data.customerId || null,
        caseId: data.caseId || null,
        type: data.type || 'note',
        summary: data.summary,
        outcome: data.outcome || null,
        staffEmail: data.staffEmail || '',
        staffName: data.staffName || '',
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in createInteractionSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}
