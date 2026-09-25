import { db } from './index.ts';
import { businesses } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getAllBusinessesSql() {
  try {
    return await db.select().from(businesses).orderBy(desc(businesses.createdAt));
  } catch (error) {
    console.error('Database query failed in getAllBusinessesSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function getBusinessByIdSql(id: string) {
  try {
    const result = await db.select().from(businesses).where(eq(businesses.id, id));
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in getBusinessByIdSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function getBusinessBySlugSql(slug: string) {
  try {
    const result = await db.select().from(businesses).where(eq(businesses.slug, slug.toLowerCase().trim()));
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in getBusinessBySlugSql:', error);
    throw new Error('Database query failed', { cause: error });
  }
}

export async function upsertBusinessSql(data: any) {
  try {
    const cleanSlug = (data.slug || data.name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');

    const id = data.id || `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const result = await db
      .insert(businesses)
      .values({
        id,
        name: data.name,
        slug: cleanSlug,
        category: data.category || 'Geral',
        logoUrl: data.logoUrl || null,
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        googleReviewUrl: data.googleReviewUrl || null,
        status: data.status || 'active',
        planId: data.planId || 'plan_pro',
        ownerId: data.ownerId || 'owner_default',
        currency: data.currency || 'EUR',
        password: data.password || 'reputa123',
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: businesses.id,
        set: {
          name: data.name,
          slug: cleanSlug,
          category: data.category,
          logoUrl: data.logoUrl,
          phone: data.phone,
          email: data.email,
          address: data.address,
          googleReviewUrl: data.googleReviewUrl,
          status: data.status || 'active',
          planId: data.planId,
          currency: data.currency,
          password: data.password,
          updatedAt: new Date()
        }
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertBusinessSql:', error);
    throw new Error('Database operation failed', { cause: error });
  }
}

export async function deleteBusinessSql(id: string) {
  try {
    const result = await db.delete(businesses).where(eq(businesses.id, id)).returning();
    return result[0] || null;
  } catch (error) {
    console.error('Database query failed in deleteBusinessSql:', error);
    throw new Error('Database operation failed', { cause: error });
  }
}
