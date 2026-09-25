import { db } from './index.ts';
import { plans, platformSettings } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getPlansSql() {
  try {
    const list = await db.select().from(plans);
    return list.map((p) => ({
      ...p,
      features: p.features ? JSON.parse(p.features) : []
    }));
  } catch (error) {
    console.error('Database query failed in getPlansSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function getPlatformSettingsSql() {
  try {
    const list = await db.select().from(platformSettings);
    return list[0] || null;
  } catch (error) {
    console.error('Database query failed in getPlatformSettingsSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}
