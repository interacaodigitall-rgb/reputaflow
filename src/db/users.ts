import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

const inMemoryUsers: any[] = [];

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  const userRecord = {
    id: uid,
    email,
    displayName: displayName || email.split('@')[0],
    role: email === 'eunawebse@gmail.com' ? 'super_admin' : 'merchant',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const existingIdx = inMemoryUsers.findIndex(u => u.id === uid || u.email === email);
  if (existingIdx !== -1) {
    inMemoryUsers[existingIdx] = { ...inMemoryUsers[existingIdx], ...userRecord };
  } else {
    inMemoryUsers.push(userRecord);
  }

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

    return result[0] || userRecord;
  } catch (error) {
    console.warn('[getOrCreateUser] Cloud SQL insert failed, using memory store:', error);
    return userRecord;
  }
}

export async function getUserById(id: string) {
  try {
    const result = await db.select().from(users).where(eq(users.id, id));
    if (result[0]) {
      return result[0];
    }
  } catch (error) {
    console.warn('[getUserById] Cloud SQL query failed, using memory store:', error);
  }
  return inMemoryUsers.find(u => u.id === id) || null;
}
