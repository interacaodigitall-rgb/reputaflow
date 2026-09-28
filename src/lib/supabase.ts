import { createClient } from '@supabase/supabase-js';

const supabaseUrl: string =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '') ||
  'https://ltpxwagdnrtuulzhfdjk.supabase.co';

const supabaseAnonKey: string =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '') ||
  '';

export const supabase = createClient(
  supabaseUrl.trim(),
  supabaseAnonKey && supabaseAnonKey.trim()
    ? supabaseAnonKey.trim()
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.anon_key_placeholder'
);

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseAnonKey && supabaseAnonKey.trim().length > 0 && !supabaseAnonKey.includes('placeholder'));
}

/**
 * Compresses an image file client-side to a manageable base64 DataURL (max 1200px, JPEG/PNG).
 */
export async function fileToOptimizedDataUrl(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.9): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        resolve('');
        return;
      }
      if (file.type.includes('svg') || file.size < 300 * 1024) {
        resolve(src);
        return;
      }

      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const compressed = canvas.toDataURL(mimeType, quality);
          resolve(compressed);
        } else {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads logo to Supabase Storage
 */
export async function uploadToSupabaseStorage(file: File, folder: string = 'logos'): Promise<string> {
  const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  const candidateBuckets = ['uploads', 'logos', 'public', 'images'];
  for (const bucket of candidateBuckets) {
    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType: file.type || `image/${fileExt}`,
          cacheControl: '3600',
          upsert: true
        });

      if (!error) {
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        if (publicUrl && publicUrl.startsWith('http')) {
          return publicUrl;
        }
      }
    } catch (e) {
      console.warn(`[Supabase Storage] Bucket ${bucket} upload notice:`, e);
    }
  }

  // Fallback to client-side optimized base64
  return await fileToOptimizedDataUrl(file);
}

export async function uploadBusinessLogo(file: File, businessId: string): Promise<string> {
  if (!file) throw new Error('Nenhum ficheiro fornecido.');
  if (!file.type.startsWith('image/')) throw new Error('O ficheiro selecionado não é uma imagem válida.');
  if (file.size > 25 * 1024 * 1024) throw new Error('A imagem selecionada ultrapassa o limite de 25MB.');

  const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanId = (businessId || 'biz').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${cleanId}_${Date.now()}.${fileExt}`;
  const filePath = `logos/${fileName}`;

  let finalPublicUrl: string | null = null;

  const candidateBuckets = ['uploads', 'logos', 'public', 'images'];
  for (const bucket of candidateBuckets) {
    try {
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType: file.type || `image/${fileExt}`,
          cacheControl: '3600',
          upsert: true
        });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(filePath);

        if (publicUrl && publicUrl.startsWith('http')) {
          finalPublicUrl = publicUrl;
          break;
        }
      }
    } catch (err) {
      console.warn(`[uploadBusinessLogo] Supabase storage bucket '${bucket}' attempt:`, err);
    }
  }

  if (!finalPublicUrl) {
    finalPublicUrl = await fileToOptimizedDataUrl(file);
  }

  if (businessId) {
    try {
      await Promise.all([
        supabase.from('merchants').update({ logo_url: finalPublicUrl, updated_at: new Date().toISOString() }).eq('id', businessId),
        supabase.from('businesses').update({ logo_url: finalPublicUrl, updated_at: new Date().toISOString() }).eq('id', businessId)
      ]);
    } catch {}
  }

  return finalPublicUrl;
}
