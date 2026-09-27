import { createClient } from '@supabase/supabase-js';

function cleanSupabaseUrl(url?: string): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return 'https://ltpxwagdnrtuulzhfdjk.supabase.co';
  }
  return url.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '') || 'https://ltpxwagdnrtuulzhfdjk.supabase.co';
}

const rawUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '');
const rawKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '');

const supabaseUrl = cleanSupabaseUrl(rawUrl);
// Provide a fallback dummy string so createClient does not throw 'supabaseKey is required' when key is not set
const supabaseAnonKey = rawKey && rawKey.trim() ? rawKey.trim() : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured(): boolean {
  return Boolean(rawKey && rawKey.trim().length > 0 && !rawKey.includes('placeholder'));
}

export async function uploadToSupabaseStorage(file: File, folder: string = 'logos'): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase Anon Key não configurada em VITE_SUPABASE_ANON_KEY.');
  }

  const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  const { error } = await supabase.storage
    .from('uploads')
    .upload(filePath, file, {
      contentType: file.type || `image/${fileExt}`,
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

export async function uploadBusinessLogo(file: File, businessId: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase não está configurado.');
  }
  if (!file) {
    throw new Error('Nenhum ficheiro fornecido.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('O ficheiro selecionado não é uma imagem válida.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('A imagem selecionada ultrapassa o limite de 10MB.');
  }

  const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanId = (businessId || 'biz').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${cleanId}_${Date.now()}.${fileExt}`;
  const filePath = `logos/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(filePath, file, {
      contentType: file.type || `image/${fileExt}`,
      cacheControl: '3600',
      upsert: true
    });

  if (uploadError) {
    console.error('[Supabase Storage] Erro no upload:', uploadError);
    throw new Error(`Erro no Supabase Storage: ${uploadError.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('uploads')
    .getPublicUrl(filePath);

  if (!publicUrl || !publicUrl.startsWith('http')) {
    throw new Error('Não foi possível gerar a URL pública definitiva da imagem.');
  }

  // Persiste a URL pública no banco de dados na tabela 'businesses'
  const { error: dbError } = await supabase
    .from('businesses')
    .update({
      logo_url: publicUrl,
      updated_at: new Date().toISOString()
    })
    .eq('id', businessId);

  if (dbError) {
    console.error('[Supabase DB] Erro ao atualizar logo_url:', dbError);
    throw new Error(`Falha ao gravar URL no banco de dados: ${dbError.message}`);
  }

  return publicUrl;
}
