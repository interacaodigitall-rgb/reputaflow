import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const rawKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = rawUrl && rawUrl.trim() ? rawUrl : 'https://ltpxwagdnrtuulzhfdjk.supabase.co';
// Provide a fallback dummy string so createClient does not throw 'supabaseKey is required' when key is not set
const supabaseAnonKey = rawKey && rawKey.trim() ? rawKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured(): boolean {
  return Boolean(rawKey && rawKey.trim().length > 0 && !rawKey.includes('placeholder'));
}

export async function uploadToSupabaseStorage(file: File): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase Anon Key não configurada em VITE_SUPABASE_ANON_KEY.');
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
