import { supabase, isSupabaseConfigured, uploadToSupabaseStorage } from './supabase';

export { supabase, isSupabaseConfigured, uploadToSupabaseStorage };

export function getSupabaseClient() {
  return isSupabaseConfigured() ? supabase : null;
}
