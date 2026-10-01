import { supabase } from './supabase';
import { NfcPlate, CreateNfcBatchOptions } from '../types/nfc';
import { Business } from '../types';

function mapNfcRow(row: any, businesses: Business[] = []): NfcPlate {
  const mId = row.merchant_id || row.merchantId || null;
  const matchedBiz = mId ? businesses.find((b) => b.id === mId) : undefined;

  return {
    id: String(row.id || ''),
    status: (row.status as any) === 'active' ? 'active' : 'inactive',
    merchant_id: mId,
    redirect_url: row.redirect_url || row.redirectUrl || null,
    scan_count: Number(row.scan_count ?? row.scanCount ?? 0),
    created_at: row.created_at || row.createdAt || new Date().toISOString(),
    updated_at: row.updated_at || row.updatedAt || new Date().toISOString(),
    merchant_name: matchedBiz?.name,
    merchant_slug: matchedBiz?.slug,
    merchant_logo_url: matchedBiz?.logoUrl
  };
}

/**
 * Fetches all NFC plates from Supabase
 */
export async function getNfcPlates(businesses: Business[] = []): Promise<NfcPlate[]> {
  try {
    const { data, error } = await supabase
      .from('nfc_plates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getNfcPlates error]:', error.message);
      return [];
    }

    if (data) {
      return data.map((row) => mapNfcRow(row, businesses));
    }
  } catch (err) {
    console.warn('[Supabase getNfcPlates catch]:', err);
  }

  return [];
}

/**
 * Fetches a single NFC plate by its serial ID
 */
export async function getNfcPlateById(id: string): Promise<NfcPlate | null> {
  const cleanId = (id || '').trim();
  if (!cleanId) return null;

  try {
    const { data, error } = await supabase
      .from('nfc_plates')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle();

    if (!error && data) {
      return mapNfcRow(data);
    }
  } catch (err) {
    console.warn('[getNfcPlateById catch]:', err);
  }

  return null;
}

/**
 * Generates a batch of NFC plates with sequential/padded IDs
 */
export async function createNfcPlatesBatch(
  options: CreateNfcBatchOptions
): Promise<{ success: boolean; createdCount: number; error?: string }> {
  const { quantity, prefix = '', startNumber = 1, padDigits = 3 } = options;

  if (quantity < 1) {
    return { success: false, createdCount: 0, error: 'A quantidade deve ser de pelo menos 1 placa.' };
  }

  const now = new Date().toISOString();
  const platesToInsert: any[] = [];

  for (let i = 0; i < quantity; i++) {
    const currentNum = startNumber + i;
    const padded = String(currentNum).padStart(padDigits, '0');
    const id = prefix ? `${prefix}${padded}` : padded;

    platesToInsert.push({
      id,
      status: 'inactive',
      merchant_id: null,
      redirect_url: null,
      scan_count: 0,
      created_at: now,
      updated_at: now
    });
  }

  try {
    const { error } = await supabase.from('nfc_plates').upsert(platesToInsert, {
      onConflict: 'id',
      ignoreDuplicates: false
    });

    if (error) {
      console.error('[Supabase createNfcPlatesBatch error]:', error);
      return { success: false, createdCount: 0, error: error.message };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
    }

    return { success: true, createdCount: platesToInsert.length };
  } catch (err: any) {
    console.error('[Supabase createNfcPlatesBatch catch]:', err);
    return { success: false, createdCount: 0, error: err.message || 'Erro ao gerar lote de placas.' };
  }
}

/**
 * Links a plate to a merchant and activates it
 */
export async function linkNfcPlate(
  id: string,
  merchantId: string,
  redirectUrl: string
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('nfc_plates')
      .update({
        status: 'active',
        merchant_id: merchantId || null,
        redirect_url: redirectUrl.trim(),
        updated_at: now
      })
      .eq('id', id);

    if (error) {
      console.error('[linkNfcPlate error]:', error);
      return { success: false, error: error.message };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
    }

    return { success: true };
  } catch (err: any) {
    console.error('[linkNfcPlate catch]:', err);
    return { success: false, error: err.message || 'Erro ao vincular placa.' };
  }
}

/**
 * Unlinks a plate and sets status to inactive
 */
export async function unlinkNfcPlate(id: string): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();

  try {
    const { error } = await supabase
      .from('nfc_plates')
      .update({
        status: 'inactive',
        merchant_id: null,
        redirect_url: null,
        updated_at: now
      })
      .eq('id', id);

    if (error) {
      console.error('[unlinkNfcPlate error]:', error);
      return { success: false, error: error.message };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
    }

    return { success: true };
  } catch (err: any) {
    console.error('[unlinkNfcPlate catch]:', err);
    return { success: false, error: err.message || 'Erro ao desvincular placa.' };
  }
}

/**
 * Deletes an NFC plate
 */
export async function deleteNfcPlate(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('nfc_plates').delete().eq('id', id);

    if (error) {
      console.error('[deleteNfcPlate error]:', error);
      return { success: false, error: error.message };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('reputaflow_nfc_sync'));
    }

    return { success: true };
  } catch (err: any) {
    console.error('[deleteNfcPlate catch]:', err);
    return { success: false, error: err.message || 'Erro ao excluir placa.' };
  }
}

/**
 * Increments the scan count of an active NFC plate
 */
export async function incrementNfcScan(id: string, currentCount: number = 0): Promise<void> {
  const cleanId = id.trim();
  if (!cleanId) return;

  // 1. Try Supabase RPC first (atomic)
  try {
    const { error: rpcError } = await supabase.rpc('increment_nfc_scan', { plate_id: cleanId });
    if (!rpcError) return;
  } catch {}

  // 2. Direct update fallback
  try {
    await supabase
      .from('nfc_plates')
      .update({
        scan_count: currentCount + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', cleanId);
  } catch (err) {
    console.warn('[incrementNfcScan fallback error]:', err);
  }
}

/**
 * Realtime subscription for NFC plates
 */
export function subscribeNfcPlates(
  businesses: Business[],
  callback: (plates: NfcPlate[]) => void
): () => void {
  let isSubscribed = true;

  const fetchAndNotify = async () => {
    const plates = await getNfcPlates(businesses);
    if (isSubscribed) {
      callback(plates);
    }
  };

  fetchAndNotify();

  const channelName = `rt_nfc_plates_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let channel: any = null;

  try {
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nfc_plates' }, () => {
        fetchAndNotify();
      })
      .subscribe();
  } catch (err) {
    console.warn('[Supabase Realtime NFC Channel init error]:', err);
  }

  const interval = setInterval(fetchAndNotify, 4000);

  const handleCustomSync = () => {
    fetchAndNotify();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_nfc_sync', handleCustomSync);
  }

  return () => {
    isSubscribed = false;
    clearInterval(interval);
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_nfc_sync', handleCustomSync);
    }
  };
}
