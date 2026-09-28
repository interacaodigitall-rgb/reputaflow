import {
  Business,
  Review,
  Feedback,
  RecoveryCase,
  RecoveryCaseStatus,
  Customer,
  Interaction,
  Plan,
  PlatformSettings
} from '../types/index.ts';
import { supabase, uploadBusinessLogo } from './supabase.ts';

// Zero mock data - completely live-driven by Supabase
export const REGISTERED_BUSINESSES: Business[] = [];

// ==========================================
// STRING & ID NORMALIZATION UTILS
// ==========================================
export function normalizeKey(str: string = ''): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function isMatchingBusiness(itemBizId: string | undefined, targetBizId: string | null): boolean {
  if (!targetBizId) return true;
  if (!itemBizId) return false;
  if (itemBizId === targetBizId) return true;
  const a = itemBizId.toLowerCase().trim();
  const b = targetBizId.toLowerCase().trim();
  if (a === b) return true;
  const aNorm = a.replace(/[^a-z0-9]/g, '').replace(/^biz/, '');
  const bNorm = b.replace(/[^a-z0-9]/g, '').replace(/^biz/, '');
  if (aNorm && bNorm && aNorm === bNorm) return true;
  return false;
}

// In-memory runtime state for fast rendering (NO localStorage)
let runtimeBusinesses: Business[] = [];
let runtimeReviews: Review[] = [];
let runtimeFeedback: Feedback[] = [];
let runtimeRecoveryCases: RecoveryCase[] = [];
let runtimeCustomers: Customer[] = [];

export function notifyDataChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('reputaflow_live_sync'));
  }
}

// ==========================================
// IMAGE UPLOAD SERVICE (SUPABASE STORAGE ONLY)
// ==========================================
export async function uploadImage(file: File, businessId?: string): Promise<string> {
  const currentMerchantId = businessId || 'biz';
  const publicUrl = await uploadBusinessLogo(file, currentMerchantId);

  if (businessId && businessId !== 'biz' && businessId !== 'new_biz') {
    try {
      await updateBusiness(businessId, { logoUrl: publicUrl });
    } catch {}
  }

  notifyDataChanged();
  return publicUrl;
}

// ==========================================
// BUSINESSES / MERCHANTS SERVICE (SUPABASE ONLY)
// ==========================================
function mapBusinessRow(row: any): Business {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    slug: String(row.slug || normalizeKey(row.name || String(row.id || ''))),
    category: row.category || 'Comércio & Serviços',
    address: row.address || '',
    phone: row.phone || '',
    email: row.email || '',
    googleReviewUrl: row.google_review_url || row.googleReviewUrl || '',
    logoUrl: row.logo_url || row.logoUrl || '',
    bannerUrl: row.banner_url || row.bannerUrl || '',
    minRatingForGoogle: Number(row.min_rating_for_google ?? row.minRatingForGoogle ?? 4),
    qrThemeColor: row.qr_theme_color || row.qrThemeColor || '#4f46e5',
    activePlan: row.active_plan || row.activePlan || row.plan_id || 'pro',
    planId: row.plan_id || row.planId || 'plan_pro',
    ownerId: row.owner_id || row.ownerId || '',
    currency: (row.currency as 'EUR' | 'BRL') || 'EUR',
    status: (row.status as any) || 'active',
    password: row.password || 'reputa123',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

// Helper for safe isolated Supabase realtime subscriptions
function createSafeTableSubscription(tableName: string, onUpdate: () => void): () => void {
  const channelName = `rt_${tableName}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let channel: any = null;

  try {
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
        onUpdate();
      })
      .subscribe();
  } catch (err) {
    console.warn(`[Supabase Realtime Channel init on ${tableName}]:`, err);
  }

  return () => {
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {}
    }
  };
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  let isSubscribed = true;

  const fetchMerchants = async () => {
    try {
      const { data, error } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
      if (!error && data) {
        const mapped = data.map(mapBusinessRow);
        runtimeBusinesses = mapped;
        if (isSubscribed) callback(mapped);
        return;
      }
      if (error) {
        console.error('[Supabase subscribeBusinesses error]:', error.message);
      }
    } catch (err) {
      console.error('[Supabase subscribeBusinesses catch]:', err);
    }

    if (isSubscribed) {
      callback(runtimeBusinesses);
    }
  };

  fetchMerchants();

  const unsubscribeRealtime = createSafeTableSubscription('businesses', fetchMerchants);
  const interval = setInterval(fetchMerchants, 3000);

  const handleCustomEvent = () => {
    if (isSubscribed) callback(runtimeBusinesses);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('reputaflow_live_sync', handleCustomEvent);
  }

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('reputaflow_live_sync', handleCustomEvent);
    }
  };
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const clean = slug ? slug.trim() : '';
  const normSlug = normalizeKey(clean);
  if (!normSlug) return null;

  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .or(`slug.eq.${clean},slug.eq.${normSlug},id.eq.${clean}`);

    if (!error && data && data.length > 0) {
      return mapBusinessRow(data[0]);
    }
  } catch (e) {
    console.error('[getBusinessBySlug catch]:', e);
  }

  return (
    runtimeBusinesses.find(
      (b) =>
        normalizeKey(b.slug) === normSlug ||
        normalizeKey(b.id) === normSlug ||
        normalizeKey(b.name) === normSlug
    ) || null
  );
}

export async function getBusinessById(id: string): Promise<Business | null> {
  return getBusinessBySlug(id);
}

export function getLocalBusinesses(): Business[] {
  return runtimeBusinesses;
}

export async function addBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<Business> {
  const id = `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const slug = data.slug ? data.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-') : normalizeKey(data.name);

  const newBiz: Business = {
    ...data,
    id,
    slug,
    category: data.category || 'Comércio & Serviços',
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    googleReviewUrl: data.googleReviewUrl || '',
    logoUrl: data.logoUrl || '',
    bannerUrl: data.bannerUrl || '',
    minRatingForGoogle: data.minRatingForGoogle || 4,
    qrThemeColor: data.qrThemeColor || '#4f46e5',
    activePlan: data.activePlan || 'pro',
    planId: data.planId || 'plan_pro',
    ownerId: data.ownerId || 'admin-created',
    currency: data.currency || 'EUR',
    status: data.status || 'active',
    password: data.password || 'reputa123',
    createdAt: now,
    updatedAt: now
  };

  const payload = {
    id,
    name: newBiz.name,
    slug: newBiz.slug,
    category: newBiz.category,
    address: newBiz.address || '',
    phone: newBiz.phone || '',
    email: newBiz.email || '',
    google_review_url: newBiz.googleReviewUrl || null,
    logo_url: newBiz.logoUrl || null,
    status: newBiz.status,
    plan_id: newBiz.planId,
    owner_id: newBiz.ownerId,
    currency: newBiz.currency,
    created_at: now,
    updated_at: now
  };

  try {
    const { error } = await supabase.from('businesses').insert([payload]);
    if (error) {
      console.error('[Supabase addBusiness error]:', error);
      throw new Error(`Erro ao cadastrar comércio no Supabase: ${error.message}`);
    }
  } catch (err: any) {
    console.error('[Supabase addBusiness catch]:', err);
    throw err;
  }

  runtimeBusinesses = [newBiz, ...runtimeBusinesses.filter((b) => b.id !== id)];
  notifyDataChanged();
  return newBiz;
}

export const createBusiness = addBusiness;

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const now = new Date().toISOString();
  const dbUpdates: any = { updated_at: now };
  if (data.name !== undefined) dbUpdates.name = data.name;
  if (data.slug !== undefined) dbUpdates.slug = data.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
  if (data.category !== undefined) dbUpdates.category = data.category;
  if (data.address !== undefined) dbUpdates.address = data.address;
  if (data.phone !== undefined) dbUpdates.phone = data.phone;
  if (data.email !== undefined) dbUpdates.email = data.email;
  if (data.status !== undefined) dbUpdates.status = data.status;
  if (data.currency !== undefined) dbUpdates.currency = data.currency;
  if (data.googleReviewUrl !== undefined) dbUpdates.google_review_url = data.googleReviewUrl;
  if (data.logoUrl !== undefined) dbUpdates.logo_url = data.logoUrl;
  if (data.planId !== undefined) dbUpdates.plan_id = data.planId;

  try {
    const { error } = await supabase.from('businesses').update(dbUpdates).eq('id', id);
    if (error) console.error('[Supabase updateBusiness error]:', error);
  } catch (err) {
    console.error('[Supabase updateBusiness catch]:', err);
  }

  runtimeBusinesses = runtimeBusinesses.map((b) => (b.id === id ? { ...b, ...data, updatedAt: now } : b));
  notifyDataChanged();
}

export async function deleteBusiness(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) console.error('[Supabase deleteBusiness error]:', error);
  } catch (err) {
    console.error('[Supabase deleteBusiness catch]:', err);
  }

  runtimeBusinesses = runtimeBusinesses.filter((b) => b.id !== id);
  notifyDataChanged();
}

// ==========================================
// REVIEWS SERVICE (SUPABASE ONLY)
// ==========================================
function mapReviewRow(row: any): Review {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || row.merchant_id || ''),
    customerId: row.customer_id || row.customerId || undefined,
    customerName: row.customer_name || row.customerName || 'Cliente',
    customerPhone: row.customer_phone || row.customerPhone || '',
    customerEmail: row.customer_email || row.customerEmail || '',
    rating: Number(row.rating || 5),
    channel: (row.channel as any) || 'qr',
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  let isSubscribed = true;

  const fetchReviews = async () => {
    try {
      let query = supabase.from('reviews').select('*').order('created_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && data) {
        const mapped = data.map(mapReviewRow);
        runtimeReviews = mapped;
        if (isSubscribed) callback(mapped);
        return;
      }
    } catch (err) {
      console.warn('[Supabase subscribeReviews error]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId ? runtimeReviews.filter((r) => isMatchingBusiness(r.businessId, businessId)) : runtimeReviews;
      callback(filtered);
    }
  };

  fetchReviews();

  const unsubscribeRealtime = createSafeTableSubscription('reviews', fetchReviews);
  const interval = setInterval(fetchReviews, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

export async function addReview(data: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
  const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newReview: Review = {
    ...data,
    id,
    createdAt: now
  };

  try {
    const { error } = await supabase.from('reviews').insert([
      {
        id,
        business_id: newReview.businessId,
        customer_name: newReview.customerName || null,
        customer_phone: newReview.customerPhone || null,
        customer_email: newReview.customerEmail || null,
        rating: newReview.rating,
        channel: newReview.channel,
        created_at: now
      }
    ]);
    if (error) {
      console.error('[Supabase addReview error]:', error);
      throw error;
    }
  } catch (err) {
    console.error('[Supabase addReview catch]:', err);
  }

  // Auto upsert customer in CRM
  if (newReview.customerName || newReview.customerPhone || newReview.customerEmail) {
    try {
      await upsertCustomerFromReview(newReview);
    } catch {}
  }

  runtimeReviews = [newReview, ...runtimeReviews];
  notifyDataChanged();
  return newReview;
}

export const submitReview = async (data: any): Promise<Review & { reviewId: string }> => {
  const rev = await addReview(data);
  return { ...rev, reviewId: rev.id };
};

export async function deleteReview(reviewId: string): Promise<void> {
  try {
    await supabase.from('reviews').delete().eq('id', reviewId);
  } catch (err) {
    console.error('[Supabase deleteReview error]:', err);
  }

  runtimeReviews = runtimeReviews.filter((r) => r.id !== reviewId);
  notifyDataChanged();
}

export async function clearAllReviews(businessId?: string): Promise<void> {
  try {
    if (businessId) {
      await supabase.from('reviews').delete().eq('business_id', businessId);
    } else {
      await supabase.from('reviews').delete().neq('id', '');
    }
  } catch (err) {
    console.error('[Supabase clearAllReviews error]:', err);
  }

  runtimeReviews = businessId ? runtimeReviews.filter((r) => !isMatchingBusiness(r.businessId, businessId)) : [];
  notifyDataChanged();
}

// ==========================================
// FEEDBACK & RECOVERY CASES SERVICE (SUPABASE ONLY)
// ==========================================
function mapFeedbackRow(row: any): Feedback {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || ''),
    reviewId: String(row.review_id || row.reviewId || ''),
    customerId: row.customer_id || row.customerId || undefined,
    customerName: row.customer_name || row.customerName || 'Cliente',
    customerPhone: row.customer_phone || row.customerPhone || '',
    customerEmail: row.customer_email || row.customerEmail || '',
    rating: Number(row.rating || 1),
    question1: row.question1 || '',
    question2: row.question2 || '',
    question3WantsContact: Boolean(row.question3_wants_contact ?? row.question3WantsContact ?? true),
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  let isSubscribed = true;

  const fetchFeedback = async () => {
    try {
      let query = supabase.from('feedback').select('*').order('created_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && data) {
        const mapped = data.map(mapFeedbackRow);
        runtimeFeedback = mapped;
        if (isSubscribed) callback(mapped);
        return;
      }
    } catch (err) {
      console.warn('[Supabase subscribeFeedback error]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId ? runtimeFeedback.filter((f) => isMatchingBusiness(f.businessId, businessId)) : runtimeFeedback;
      callback(filtered);
    }
  };

  fetchFeedback();

  const unsubscribeRealtime = createSafeTableSubscription('feedback', fetchFeedback);
  const interval = setInterval(fetchFeedback, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

function mapRecoveryRow(row: any): RecoveryCase {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || ''),
    customerId: row.customer_id || row.customerId || undefined,
    reviewId: String(row.review_id || row.reviewId || ''),
    feedbackId: row.feedback_id || row.feedbackId || '',
    customerName: row.customer_name || row.customerName || 'Cliente',
    customerPhone: row.customer_phone || row.customerPhone || '',
    customerEmail: row.customer_email || row.customerEmail || '',
    rating: Number(row.rating || 1),
    status: (row.status as RecoveryCaseStatus) || 'novo',
    notes: row.notes || '',
    assignedTo: row.assigned_to || row.assignedTo || '',
    resolvedAt: row.resolved_at || row.resolvedAt || undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  let isSubscribed = true;

  const fetchCases = async () => {
    try {
      let query = supabase.from('recovery_cases').select('*').order('created_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && data) {
        const mapped = data.map(mapRecoveryRow);
        runtimeRecoveryCases = mapped;
        if (isSubscribed) callback(mapped);
        return;
      }
    } catch (err) {
      console.warn('[Supabase subscribeRecoveryCases error]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId ? runtimeRecoveryCases.filter((c) => isMatchingBusiness(c.businessId, businessId)) : runtimeRecoveryCases;
      callback(filtered);
    }
  };

  fetchCases();

  const unsubscribeRealtime = createSafeTableSubscription('recovery_cases', fetchCases);
  const interval = setInterval(fetchCases, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

export async function addFeedbackAndCreateRecoveryCase(
  feedbackData: Omit<Feedback, 'id' | 'createdAt'>,
  reviewId: string
): Promise<{ feedback: Feedback; recoveryCase: RecoveryCase }> {
  const fbId = `fb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const caseId = `case_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const feedback: Feedback = {
    ...feedbackData,
    id: fbId,
    reviewId,
    createdAt: now
  };

  const recoveryCase: RecoveryCase = {
    id: caseId,
    businessId: feedbackData.businessId,
    customerId: feedbackData.customerId,
    reviewId,
    feedbackId: fbId,
    customerName: feedbackData.customerName,
    customerPhone: feedbackData.customerPhone,
    customerEmail: feedbackData.customerEmail,
    rating: feedbackData.rating,
    status: 'novo',
    notes: `Motivo: ${feedbackData.question1 || 'Não informado'}. Melhorias: ${feedbackData.question2 || 'Não informado'}`,
    createdAt: now,
    updatedAt: now
  };

  try {
    await Promise.all([
      supabase.from('feedback').insert([
        {
          id: fbId,
          business_id: feedback.businessId,
          review_id: reviewId,
          customer_name: feedback.customerName,
          customer_phone: feedback.customerPhone,
          customer_email: feedback.customerEmail || null,
          rating: feedback.rating,
          question1: feedback.question1,
          question2: feedback.question2,
          question3_wants_contact: feedback.question3WantsContact,
          created_at: now
        }
      ]),
      supabase.from('recovery_cases').insert([
        {
          id: caseId,
          business_id: recoveryCase.businessId,
          review_id: reviewId,
          feedback_id: fbId,
          customer_name: recoveryCase.customerName,
          customer_phone: recoveryCase.customerPhone,
          customer_email: recoveryCase.customerEmail || null,
          rating: recoveryCase.rating,
          status: recoveryCase.status,
          notes: recoveryCase.notes,
          created_at: now,
          updated_at: now
        }
      ])
    ]);
  } catch (err) {
    console.error('[Supabase addFeedbackAndCreateRecoveryCase error]:', err);
  }

  // Auto upsert customer
  try {
    await upsertCustomerFromReview({
      id: reviewId,
      businessId: feedbackData.businessId,
      customerName: feedbackData.customerName,
      customerPhone: feedbackData.customerPhone,
      customerEmail: feedbackData.customerEmail,
      rating: feedbackData.rating,
      channel: 'qr',
      createdAt: now
    });
  } catch {}

  runtimeFeedback = [feedback, ...runtimeFeedback];
  runtimeRecoveryCases = [recoveryCase, ...runtimeRecoveryCases];
  notifyDataChanged();

  return { feedback, recoveryCase };
}

export const submitFeedbackAndRecovery = async (
  data: any,
  reviewId?: string
): Promise<{ feedback: Feedback; recoveryCase: RecoveryCase }> => {
  return await addFeedbackAndCreateRecoveryCase(data, data.reviewId || reviewId || '');
};

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  const now = new Date().toISOString();
  const updates: any = { status, updated_at: now };
  if (notes !== undefined) updates.notes = notes;
  if (status === 'resolvido' || status === 'cliente_recuperado') {
    updates.resolved_at = now;
  }

  try {
    await supabase.from('recovery_cases').update(updates).eq('id', caseId);
  } catch (err) {
    console.error('[Supabase updateRecoveryCaseStatus error]:', err);
  }

  if (customerId) {
    const custStatus = status === 'cliente_recuperado' ? 'recovered' : status === 'resolvido' ? 'active' : 'in_recovery';
    try {
      await supabase.from('customers').update({ status: custStatus, updated_at: now }).eq('id', customerId);
    } catch {}
  }

  runtimeRecoveryCases = runtimeRecoveryCases.map((c) => (c.id === caseId ? { ...c, status, notes: notes ?? c.notes, updatedAt: now } : c));
  notifyDataChanged();
}

// ==========================================
// CUSTOMERS CRM SERVICE (SUPABASE ONLY)
// ==========================================
function mapCustomerRow(row: any): Customer {
  return {
    id: String(row.id || ''),
    businessId: String(row.business_id || row.businessId || ''),
    name: row.name || 'Cliente',
    phone: row.phone || '',
    email: row.email || '',
    reviewsCount: Number(row.reviews_count ?? row.reviewsCount ?? 1),
    lastReviewAt: row.last_review_at || row.lastReviewAt || new Date().toISOString(),
    avgRating: Number(row.avg_rating ?? row.avgRating ?? 5),
    status: (row.status as any) || 'active',
    internalNotes: row.internal_notes || row.internalNotes || '',
    lastInteractionAt: row.last_interaction_at || row.lastInteractionAt || undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  let isSubscribed = true;

  const fetchCustomers = async () => {
    try {
      let query = supabase.from('customers').select('*').order('last_review_at', { ascending: false });
      if (businessId) {
        query = query.eq('business_id', businessId);
      }
      const { data, error } = await query;
      if (!error && data) {
        const mapped = data.map(mapCustomerRow);
        runtimeCustomers = mapped;
        if (isSubscribed) callback(mapped);
        return;
      }
    } catch (err) {
      console.warn('[Supabase subscribeCustomers error]:', err);
    }

    if (isSubscribed) {
      const filtered = businessId ? runtimeCustomers.filter((c) => isMatchingBusiness(c.businessId, businessId)) : runtimeCustomers;
      callback(filtered);
    }
  };

  fetchCustomers();

  const unsubscribeRealtime = createSafeTableSubscription('customers', fetchCustomers);
  const interval = setInterval(fetchCustomers, 3000);

  return () => {
    isSubscribed = false;
    unsubscribeRealtime();
    clearInterval(interval);
  };
}

export async function upsertCustomerFromReview(review: Review): Promise<Customer> {
  const cleanPhone = (review.customerPhone || '').trim();
  const cleanEmail = (review.customerEmail || '').trim().toLowerCase();
  const cleanName = (review.customerName || 'Cliente').trim();
  const now = new Date().toISOString();

  let existing: Customer | null = null;

  try {
    let q = supabase.from('customers').select('*').eq('business_id', review.businessId);
    if (cleanPhone) {
      q = q.eq('phone', cleanPhone);
    } else if (cleanEmail) {
      q = q.eq('email', cleanEmail);
    }
    const { data } = await q;
    if (data && data.length > 0) {
      existing = mapCustomerRow(data[0]);
    }
  } catch {}

  if (existing) {
    const newCount = existing.reviewsCount + 1;
    const newAvg = Number(((existing.avgRating * existing.reviewsCount + review.rating) / newCount).toFixed(1));
    const nextStatus = review.rating <= 3 ? 'in_recovery' : existing.status === 'in_recovery' ? 'recovered' : 'active';

    const updatedCust: Customer = {
      ...existing,
      name: cleanName || existing.name,
      phone: cleanPhone || existing.phone,
      email: cleanEmail || existing.email,
      reviewsCount: newCount,
      avgRating: newAvg,
      lastReviewAt: now,
      status: nextStatus,
      updatedAt: now
    };

    try {
      await supabase.from('customers').update({
        name: updatedCust.name,
        phone: updatedCust.phone,
        email: updatedCust.email || null,
        reviews_count: newCount,
        avg_rating: newAvg,
        last_review_at: now,
        status: nextStatus,
        updated_at: now
      }).eq('id', existing.id);
    } catch {}

    runtimeCustomers = runtimeCustomers.map((c) => (c.id === existing?.id ? updatedCust : c));
    notifyDataChanged();
    return updatedCust;
  } else {
    const custId = `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const newCust: Customer = {
      id: custId,
      businessId: review.businessId,
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      reviewsCount: 1,
      avgRating: review.rating,
      lastReviewAt: now,
      status: review.rating <= 3 ? 'in_recovery' : 'active',
      createdAt: now,
      updatedAt: now
    };

    try {
      await supabase.from('customers').insert([
        {
          id: custId,
          business_id: newCust.businessId,
          name: newCust.name,
          phone: newCust.phone || '',
          email: newCust.email || null,
          reviews_count: 1,
          avg_rating: review.rating,
          last_review_at: now,
          status: newCust.status,
          created_at: now,
          updated_at: now
        }
      ]);
    } catch {}

    runtimeCustomers = [newCust, ...runtimeCustomers];
    notifyDataChanged();
    return newCust;
  }
}

export async function addCustomer(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
  const custId = `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  const newCust: Customer = {
    ...data,
    id: custId,
    createdAt: now,
    updatedAt: now
  };

  try {
    await supabase.from('customers').insert([
      {
        id: custId,
        business_id: newCust.businessId,
        name: newCust.name,
        phone: newCust.phone || '',
        email: newCust.email || null,
        reviews_count: newCust.reviewsCount,
        avg_rating: newCust.avgRating,
        last_review_at: newCust.lastReviewAt,
        status: newCust.status,
        internal_notes: newCust.internalNotes || null,
        created_at: now,
        updated_at: now
      }
    ]);
  } catch (err) {
    console.error('[Supabase addCustomer error]:', err);
  }

  runtimeCustomers = [newCust, ...runtimeCustomers];
  notifyDataChanged();
  return newCust;
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
  const now = new Date().toISOString();
  const dbUpdates: any = { updated_at: now };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.internalNotes !== undefined) dbUpdates.internal_notes = updates.internalNotes;

  try {
    await supabase.from('customers').update(dbUpdates).eq('id', id);
  } catch (err) {
    console.error('[Supabase updateCustomer error]:', err);
  }

  runtimeCustomers = runtimeCustomers.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: now } : c));
  notifyDataChanged();
}

export async function deleteCustomer(id: string): Promise<void> {
  try {
    await supabase.from('customers').delete().eq('id', id);
  } catch (err) {
    console.error('[Supabase deleteCustomer error]:', err);
  }

  runtimeCustomers = runtimeCustomers.filter((c) => c.id !== id);
  notifyDataChanged();
}

// ==========================================
// INTERACTIONS SERVICE
// ==========================================
export function subscribeInteractions(businessId: string | null, callback: (list: Interaction[]) => void) {
  let isSubscribed = true;

  const fetchInteractions = async () => {
    if (isSubscribed) callback([]);
  };

  fetchInteractions();
  return () => {
    isSubscribed = false;
  };
}

export async function addInteraction(data: Omit<Interaction, 'id' | 'createdAt'>): Promise<Interaction> {
  const id = `int_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();
  return { ...data, id, createdAt: now };
}

// ==========================================
// PLANS & PLATFORM SETTINGS
// ==========================================
export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    price: 99,
    currency: 'EUR',
    maxBusinesses: 1,
    maxReviewsMonth: 200,
    features: ['QR Code Inteligente', 'Página Pública de Avaliação', 'Proteção Básica de Reputação'],
    isActive: true
  },
  {
    id: 'plan_pro',
    name: 'Profissional',
    price: 199,
    currency: 'EUR',
    maxBusinesses: 3,
    maxReviewsMonth: 1000,
    features: ['QR Code Personalizado', 'CRM de Recuperação Ativa', 'Gestão Multi-moeda (EUR / BRL)', 'Exportação de Relatórios'],
    isActive: true
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    price: 399,
    currency: 'EUR',
    maxBusinesses: 10,
    maxReviewsMonth: 5000,
    features: ['Todas as funcionalidades Pro', 'Suporte Prioritário 24/7', 'Acesso Multi-utilizador / Equipa'],
    isActive: true
  }
];

export async function getPlans(): Promise<Plan[]> {
  return DEFAULT_PLANS;
}

export async function savePlan(_plan: Plan): Promise<void> {}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  id: 'default',
  platformName: 'ReputaFlow',
  supportEmail: 'suporte@reputaflow.com',
  defaultGoogleReviewInstructions:
    'Agradecemos a sua avaliação sincera! O seu feedback ajuda outros clientes na comunidade.',
  allowPublicRegistration: false
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return DEFAULT_PLATFORM_SETTINGS;
}

export async function savePlatformSettings(_settings: Partial<PlatformSettings>): Promise<void> {}
