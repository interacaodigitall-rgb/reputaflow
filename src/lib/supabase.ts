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
      // If SVG or already small, return directly
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
 * Uploads an image payload to the local API /api/upload endpoint
 */
async function uploadToLocalApi(base64Data: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data, filename })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.url) {
        return data.url;
      }
    }
  } catch (err) {
    console.warn('[uploadToLocalApi] API upload fallback notice:', err);
  }
  return null;
}

export async function uploadToSupabaseStorage(file: File, folder: string = 'logos'): Promise<string> {
  const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  // 1. Try Supabase Storage if configured
  if (isSupabaseConfigured()) {
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
        console.warn(`[Supabase Storage] Bucket ${bucket} upload failed, trying next fallback:`, e);
      }
    }
  }

  // 2. Fallback: Optimize image client-side and upload to /api/upload or return data URL
  const optimizedDataUrl = await fileToOptimizedDataUrl(file);
  if (optimizedDataUrl) {
    const localUrl = await uploadToLocalApi(optimizedDataUrl, fileName);
    if (localUrl) return localUrl;
    return optimizedDataUrl;
  }

  throw new Error('Não foi possível processar o arquivo de imagem.');
}

export async function uploadBusinessLogo(file: File, businessId: string): Promise<string> {
  if (!file) {
    throw new Error('Nenhum ficheiro fornecido.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('O ficheiro selecionado não é uma imagem válida.');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('A imagem selecionada ultrapassa o limite de 25MB.');
  }

  const fileExt = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanId = (businessId || 'biz').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${cleanId}_${Date.now()}.${fileExt}`;
  const filePath = `logos/${fileName}`;

  let finalPublicUrl: string | null = null;

  // 1. Try Supabase Storage if configured
  if (isSupabaseConfigured()) {
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
        console.warn(`[uploadBusinessLogo] Supabase storage bucket '${bucket}' attempt failed:`, err);
      }
    }
  }

  // 2. If Supabase storage is unavailable or failed, fallback to /api/upload with optimized DataURL
  if (!finalPublicUrl) {
    const dataUrl = await fileToOptimizedDataUrl(file);
    if (dataUrl) {
      const serverUrl = await uploadToLocalApi(dataUrl, fileName);
      finalPublicUrl = serverUrl || dataUrl;
    }
  }

  if (!finalPublicUrl) {
    throw new Error('Não foi possível processar ou enviar a imagem.');
  }

  // 3. Persist to Supabase DB if possible (non-blocking failure)
  if (isSupabaseConfigured() && businessId) {
    (async () => {
      try {
        const { error } = await supabase
          .from('businesses')
          .update({
            logo_url: finalPublicUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', businessId);
        if (error) console.warn('[Supabase DB] Non-fatal logo_url update warning:', error);
      } catch (e) {
        console.warn('[Supabase DB] Logo update catch:', e);
      }
    })();
  }

  return finalPublicUrl;
}
