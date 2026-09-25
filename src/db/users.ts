import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        id: uid,
        email,
        displayName: displayName || email.split('@')[0],
        role: email === 'eunawebse@gmail.com' ? 'super_admin' : 'merchant'
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
          updatedAt: new Date()
        }
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database operation failed', { cause: error });
  }
}

export async function getUserById(id: string) {
  try {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in getUserById:', error);
    throw new Error('Database operation failed', { cause: error });
  }
}
