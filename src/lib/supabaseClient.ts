import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_PROJECT_ID = 'ltpxwagdnrtuulzhfdjk';
const SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;

export function getSupabaseAnonKey(): string {
  try {
    return localStorage.getItem('reputaflow_supabase_anon_key') || 
           (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
           '';
  } catch {
    return '';
  }
}

export function setSupabaseAnonKey(key: string) {
  try {
    localStorage.setItem('reputaflow_supabase_anon_key', key.trim());
  } catch {}
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const anonKey = getSupabaseAnonKey();
  if (!anonKey) return null;

  if (cachedClient && cachedKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(SUPABASE_URL, anonKey);
    cachedKey = anonKey;
    return cachedClient;
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e);
    return null;
  }
}

export async function uploadToSupabaseStorage(file: File): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase Anon Key não configurada.');
  }

  const fileExt = file.name.split('.').pop() || 'png';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `logos/${fileName}`;

  const { data, error } = await supabase.storage
    .from('uploads')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    throw new Error(`Erro Supabase Storage: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('uploads')
    .getPublicUrl(filePath);

  return publicUrl;
}
