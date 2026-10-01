import { db } from './index.ts';
import { nfcPlates } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc.ts';

export async function getAllNfcPlatesSql(): Promise<NfcPlate[]> {
  try {
    const rows = await db.select().from(nfcPlates).orderBy(desc(nfcPlates.createdAt));
    return rows.map((r) => ({
      id: r.id,
      status: r.status as any,
      merchant_id: r.merchantId,
      redirect_url: r.redirectUrl,
      scan_count: r.scanCount,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString()
    }));
  } catch (error) {
    console.error('Error fetching NFC plates SQL:', error);
    return [];
  }
}

export async function getNfcPlateByIdSql(id: string): Promise<NfcPlate | null> {
  try {
    const clean = id.trim();
    const rows = await db.select().from(nfcPlates).where(eq(nfcPlates.id, clean)).limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      status: r.status as any,
      merchant_id: r.merchantId,
      redirect_url: r.redirectUrl,
      scan_count: r.scanCount,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString()
    };
  } catch (error) {
    console.error('Error fetching NFC plate by ID SQL:', error);
    return null;
  }
}

export async function createNfcBatchSql(options: CreateNfcBatchOptions): Promise<NfcPlate[]> {
  const { quantity, prefix = '', startNumber = 1, padDigits = 3 } = options;
  const now = new Date();
  const created: NfcPlate[] = [];

  for (let i = 0; i < quantity; i++) {
    const currentNum = startNumber + i;
    const padded = String(currentNum).padStart(padDigits, '0');
    const id = prefix ? `${prefix}${padded}` : padded;

    try {
      await db.insert(nfcPlates).values({
        id,
        status: 'inactive',
        merchantId: null,
        redirectUrl: null,
        scanCount: 0,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing();

      created.push({
        id,
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        scan_count: 0,
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      });
    } catch (e) {
      console.warn('Error inserting plate item:', e);
    }
  }

  return created;
}

export async function linkNfcPlateSql(id: string, merchantId: string, redirectUrl: string): Promise<boolean> {
  try {
    const now = new Date();
    await db.update(nfcPlates)
      .set({
        status: 'active',
        merchantId: merchantId || null,
        redirectUrl: redirectUrl.trim(),
        updatedAt: now
      })
      .where(eq(nfcPlates.id, id.trim()));
    return true;
  } catch (error) {
    console.error('Error linking NFC plate SQL:', error);
    return false;
  }
}

export async function unlinkNfcPlateSql(id: string): Promise<boolean> {
  try {
    const now = new Date();
    await db.update(nfcPlates)
      .set({
        status: 'inactive',
        merchantId: null,
        redirectUrl: null,
        updatedAt: now
      })
      .where(eq(nfcPlates.id, id.trim()));
    return true;
  } catch (error) {
    console.error('Error unlinking NFC plate SQL:', error);
    return false;
  }
}

export async function deleteNfcPlateSql(id: string): Promise<boolean> {
  try {
    await db.delete(nfcPlates).where(eq(nfcPlates.id, id.trim()));
    return true;
  } catch (error) {
    console.error('Error deleting NFC plate SQL:', error);
    return false;
  }
}

export async function incrementNfcScanSql(id: string): Promise<void> {
  try {
    const plate = await getNfcPlateByIdSql(id);
    if (!plate) return;
    await db.update(nfcPlates)
      .set({
        scanCount: (plate.scan_count || 0) + 1,
        updatedAt: new Date()
      })
      .where(eq(nfcPlates.id, id.trim()));
  } catch (error) {
    console.error('Error incrementing scan count SQL:', error);
  }
}
