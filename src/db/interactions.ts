import { db } from './index.ts';
import { interactions } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

const inMemoryInteractions: any[] = [];

export async function getInteractionsSql(businessId?: string) {
  try {
    if (businessId) {
      const list = await db
        .select()
        .from(interactions)
        .where(eq(interactions.businessId, businessId))
        .orderBy(desc(interactions.createdAt));
      if (list && list.length > 0) return list;
    } else {
      const list = await db.select().from(interactions).orderBy(desc(interactions.createdAt));
      if (list && list.length > 0) return list;
    }
  } catch (error) {
    console.warn('[getInteractionsSql] Cloud SQL query failed, using in-memory store');
  }

  if (businessId) {
    return inMemoryInteractions.filter(i => i.businessId === businessId);
  }
  return inMemoryInteractions;
}

export async function createInteractionSql(data: any) {
  const id = data.id || `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const record = {
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
  };

  inMemoryInteractions.unshift(record);

  try {
    const result = await db
      .insert(interactions)
      .values(record)
      .returning();

    return result[0] || record;
  } catch (error) {
    console.warn('[createInteractionSql] Cloud SQL insert failed, saved to in-memory store:', error);
    return record;
  }
}
