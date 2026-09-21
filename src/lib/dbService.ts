import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import {
  Business,
  Customer,
  Review,
  Feedback,
  RecoveryCase,
  RecoveryCaseStatus,
  Interaction,
  Plan,
  PlatformSettings,
  UserProfile
} from '../types';

// ==========================================
// UTILS
// ==========================================

export function normalizeKey(str: string = ''): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  });
  return result;
}

// ==========================================
// BUSINESSES (LOCAL & FIRESTORE RESILIENT PERSISTENCE)
// ==========================================

const LOCAL_STORAGE_KEY_BIZ = 'reputaflow_local_businesses';

export function getLocalBusinesses(): Business[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_BIZ);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveLocalBusiness(biz: Business): void {
  try {
    const list = getLocalBusinesses();
    const idx = list.findIndex(b => b.id === biz.id || (biz.slug && b.slug === biz.slug));
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...biz };
    } else {
      list.unshift(biz);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY_BIZ, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated', { detail: list }));
  } catch (e) {
    console.error('Failed to save business locally:', e);
  }
}

export function removeLocalBusiness(id: string): void {
  try {
    const list = getLocalBusinesses().filter(b => b.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY_BIZ, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('reputaflow_businesses_updated', { detail: list }));
  } catch (e) {
    console.error('Failed to remove business locally:', e);
  }
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  if (!slug) return null;
  const cleanSlug = slug.toLowerCase().trim();
  const norm = normalizeKey(slug);

  // 1. Check local storage first (instant response if available on this device)
  const localList = getLocalBusinesses();
  const localMatch = localList.find(b => {
    const bId = (b.id || '').toLowerCase();
    const bSlug = (b.slug || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();
    if (bSlug === cleanSlug || bId === cleanSlug || bName === cleanSlug) return true;
    if (normalizeKey(bSlug) === norm || normalizeKey(bId) === norm || normalizeKey(bName) === norm) return true;
    return false;
  });
  if (localMatch) return localMatch;

  // 2. Fetch from Backend Server API (shared across all devices, customer phones, tabs)
  try {
    const res = await fetch(`/api/businesses/${encodeURIComponent(cleanSlug)}`);
    if (res.ok) {
      const serverBiz = await res.json();
      if (serverBiz && (serverBiz.id || serverBiz.slug)) {
        saveLocalBusiness(serverBiz);
        return serverBiz;
      }
    }
  } catch (apiErr) {
    console.warn('API getBusinessBySlug warning:', apiErr);
  }

  // 2b. Fetch all from Backend Server API and scan with normalized key
  try {
    const resAll = await fetch('/api/businesses');
    if (resAll.ok) {
      const allBiz: Business[] = await resAll.json();
      for (const b of allBiz) {
        saveLocalBusiness(b);
        const bId = (b.id || '').toLowerCase();
        const bSlug = (b.slug || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        if (
          bSlug === cleanSlug ||
          bId === cleanSlug ||
          bName === cleanSlug ||
          normalizeKey(bSlug) === norm ||
          normalizeKey(bId) === norm ||
          normalizeKey(bName) === norm
        ) {
          return b;
        }
      }
    }
  } catch (apiAllErr) {
    console.warn('API getAllBusinesses warning:', apiAllErr);
  }

  // 3. Anonymous sign-in attempt in background if no user is authenticated
  if (!auth.currentUser) {
    try {
      await signInAnonymously(auth);
    } catch {
      // Ignored if anonymous auth disabled
    }
  }

  const path = 'businesses';

  // Strategy A: Query Firestore by slug field
  try {
    const q = query(collection(db, path), where('slug', '==', cleanSlug), limit(1));
    const snapPromise = getDocs(q);
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    const snap = await Promise.race([snapPromise, timeout]);
    if (snap && !snap.empty) {
      const d = snap.docs[0];
      const found = { id: d.id, ...d.data() } as Business;
      saveLocalBusiness(found);
      return found;
    }
  } catch (err) {
    console.warn('Strategy A (query by slug) warning:', err);
  }

  // Strategy B: Direct fetch by document ID
  try {
    const docRef = doc(db, path, slug);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const found = { id: docSnap.id, ...docSnap.data() } as Business;
      saveLocalBusiness(found);
      return found;
    }
  } catch (err) {
    console.warn('Strategy B (doc by id) warning:', err);
  }

  // Strategy C: Scan all businesses in Firestore
  try {
    const allDocsSnap = await getDocs(collection(db, path));
    for (const d of allDocsSnap.docs) {
      const data = d.data() as Business;
      const bSlug = (data.slug || '').toLowerCase().trim();
      const bName = (data.name || '').toLowerCase().trim();
      if (
        bSlug === cleanSlug ||
        d.id.toLowerCase() === cleanSlug ||
        normalizeKey(bSlug) === norm ||
        normalizeKey(d.id) === norm ||
        normalizeKey(bName) === norm
      ) {
        const found = { ...data, id: d.id } as Business;
        saveLocalBusiness(found);
        return found;
      }
    }
  } catch (err) {
    console.warn('Strategy C (scan all docs) warning:', err);
  }

  return null;
}

export async function getBusinessById(id: string): Promise<Business | null> {
  const localMatch = getLocalBusinesses().find(b => b.id === id);
  if (localMatch) return localMatch;

  try {
    const res = await fetch(`/api/businesses/${encodeURIComponent(id)}`);
    if (res.ok) {
      const serverBiz = await res.json();
      if (serverBiz && serverBiz.id) {
        saveLocalBusiness(serverBiz);
        return serverBiz;
      }
    }
  } catch {}

  const path = `businesses/${id}`;
  try {
    const snapPromise = getDoc(doc(db, 'businesses', id));
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    const snap = await Promise.race([snapPromise, timeout]);
    if (snap && snap.exists()) {
      const found = { id: snap.id, ...snap.data() } as Business;
      saveLocalBusiness(found);
      return found;
    }
    return localMatch || null;
  } catch (err) {
    return localMatch || null;
  }
}

export async function getAllBusinesses(): Promise<Business[]> {
  const mergedMap = new Map<string, Business>();

  // 1. Local storage
  getLocalBusinesses().forEach(b => mergedMap.set(b.id, b));

  // 2. Fetch from backend API
  try {
    const res = await fetch('/api/businesses');
    if (res.ok) {
      const serverList: Business[] = await res.json();
      serverList.forEach(b => {
        mergedMap.set(b.id, b);
        saveLocalBusiness(b);
      });
    }
  } catch (err) {
    console.warn('API fetch warning:', err);
  }

  // 3. Fetch from Firestore
  try {
    const snapPromise = getDocs(collection(db, 'businesses'));
    const timeout = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    const snap = await Promise.race([snapPromise, timeout]);
    if (snap) {
      snap.docs.forEach(d => {
        const b = { id: d.id, ...d.data() } as Business;
        mergedMap.set(b.id, b);
        saveLocalBusiness(b);
      });
    }
  } catch (err) {
    // Expected if Firestore is offline or unprovisioned
  }

  return Array.from(mergedMap.values());
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  const path = 'businesses';

  const mergeAndNotify = (firestoreList: Business[] = []) => {
    const local = getLocalBusinesses();
    const map = new Map<string, Business>();
    local.forEach(b => {
      map.set(b.id, b);
    });
    firestoreList.forEach(b => {
      map.set(b.id, b);
    });
    const merged = Array.from(map.values());
    callback(merged);
  };

  // Immediate dispatch of cached / local businesses
  mergeAndNotify();

  // Fetch backend API to ensure server-synced businesses are included immediately
  fetch('/api/businesses')
    .then(res => res.ok ? res.json() : [])
    .then((serverList: Business[]) => {
      if (Array.isArray(serverList) && serverList.length > 0) {
        serverList.forEach(b => saveLocalBusiness(b));
        mergeAndNotify(serverList);
      }
    })
    .catch(() => {});

  const handleLocalUpdate = () => {
    mergeAndNotify(lastFirestoreDocs);
  };
  window.addEventListener('reputaflow_businesses_updated', handleLocalUpdate);

  let lastFirestoreDocs: Business[] = [];
  const unsubscribe = onSnapshot(
    collection(db, path),
    (snap) => {
      lastFirestoreDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Business));
      lastFirestoreDocs.forEach(b => saveLocalBusiness(b));
      mergeAndNotify(lastFirestoreDocs);
    },
    (err) => {
      console.warn('subscribeBusinesses snapshot warning (operating with local and server cache):', err);
      mergeAndNotify(lastFirestoreDocs);
    }
  );

  return () => {
    window.removeEventListener('reputaflow_businesses_updated', handleLocalUpdate);
    unsubscribe();
  };
}

export async function createBusiness(data: Omit<Business, 'id'>, customId?: string): Promise<string> {
  const path = 'businesses';
  const cleanSlug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const targetId = customId || `biz_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

  const payload = sanitizeForFirestore({
    ...data,
    slug: cleanSlug,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const fullBusiness: Business = {
    id: targetId,
    ...payload,
    status: payload.status || 'active',
    currency: payload.currency || 'EUR',
  };

  // 1. Instantly save locally and notify all listeners so UI updates without any delay
  saveLocalBusiness(fullBusiness);

  // 2. Sync to Backend API (makes it instantly available across all devices, customer phones, incognito)
  try {
    await fetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullBusiness)
    });
  } catch (apiErr) {
    console.warn('Backend API business creation warning:', apiErr);
  }

  // 3. Asynchronously sync to Firestore with a 4-second timeout to prevent modal hanging
  try {
    const firestoreWrite = setDoc(doc(db, path, targetId), payload);
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore write timeout')), 4000)
    );
    await Promise.race([firestoreWrite, timeout]);
  } catch (err) {
    console.warn('Firestore write warning (business safely stored locally and on server):', err);
  }

  return targetId;
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const path = `businesses/${id}`;
  const payload = sanitizeForFirestore({
    ...data,
    updatedAt: new Date().toISOString()
  });

  // Update locally first
  const localList = getLocalBusinesses();
  const existing = localList.find(b => b.id === id);
  if (existing) {
    saveLocalBusiness({ ...existing, ...payload });
  }

  // Sync to Backend API
  try {
    await fetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (apiErr) {
    console.warn('Backend API business update warning:', apiErr);
  }

  try {
    const updatePromise = updateDoc(doc(db, 'businesses', id), payload);
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore update timeout')), 4000)
    );
    await Promise.race([updatePromise, timeout]);
  } catch (err) {
    console.warn('Firestore update warning (business updated locally):', err);
  }
}

export async function deleteBusiness(id: string): Promise<void> {
  const path = `businesses/${id}`;
  removeLocalBusiness(id);

  // Sync to Backend API
  try {
    await fetch(`/api/businesses/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  } catch (apiErr) {
    console.warn('Backend API business deletion warning:', apiErr);
  }

  try {
    const delPromise = deleteDoc(doc(db, 'businesses', id));
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore delete timeout')), 4000)
    );
    await Promise.race([delPromise, timeout]);
  } catch (err) {
    console.warn('Firestore delete warning (removed locally):', err);
  }
}

// ==========================================
// REVIEWS & FEEDBACK
// ==========================================

export async function submitReview(
  data: Omit<Review, 'id' | 'createdAt'>
): Promise<{ reviewId: string }> {
  const path = 'reviews';
  const targetId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const payload = sanitizeForFirestore({
    ...data,
    id: targetId,
    createdAt: new Date().toISOString(),
  });

  // Sync to Backend API
  try {
    await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (apiErr) {
    console.warn('API review submission warning:', apiErr);
  }

  try {
    const writePromise = setDoc(doc(db, path, targetId), payload);
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 3000)
    );
    await Promise.race([writePromise, timeout]);
    return { reviewId: targetId };
  } catch (err) {
    console.warn('submitReview warning (proceeding with generated id):', err);
    return { reviewId: targetId };
  }
}

export async function submitFeedbackAndRecovery(params: {
  businessId: string;
  reviewId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  rating: number;
  question1: string;
  question2: string;
  question3WantsContact: boolean;
}): Promise<{ feedbackId: string; caseId: string; customerId: string }> {
  try {
    // 1. Create or update Customer in CRM
    const customerId = await upsertCustomerByPhone({
      businessId: params.businessId,
      name: params.customerName,
      phone: params.customerPhone,
      email: params.customerEmail,
      rating: params.rating,
      status: 'in_recovery',
      internalNotes: `Feedback negativo (${params.rating} estrelas): ${params.question1.slice(0, 100)}`
    });

    // 2. Create Feedback document
    const feedbackPayload = sanitizeForFirestore({
      businessId: params.businessId,
      reviewId: params.reviewId,
      customerId,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail || '',
      rating: params.rating,
      question1: params.question1,
      question2: params.question2,
      question3WantsContact: params.question3WantsContact,
      createdAt: new Date().toISOString()
    });

    // 3. Create Recovery Case document
    const casePayload = sanitizeForFirestore({
      businessId: params.businessId,
      customerId,
      reviewId: params.reviewId,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail || '',
      rating: params.rating,
      complaint: params.question1,
      status: 'novo',
      priority: params.rating <= 2 ? 'urgente' : 'media',
      assignedTo: '',
      history: [
        {
          id: `hist_${Date.now()}`,
          action: 'Caso aberto automaticamente via página de avaliação',
          timestamp: new Date().toISOString(),
          userName: 'Sistema ReputaFlow'
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Sync to Backend API
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackPayload)
      });
      await fetch('/api/recovery_cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(casePayload)
      });
    } catch (apiErr) {
      console.warn('API feedback sync warning:', apiErr);
    }

    let fbId = `fb_${Date.now().toString(36)}`;
    let caseId = `rec_${Date.now().toString(36)}`;
    try {
      const fbRef = await addDoc(collection(db, 'feedback'), feedbackPayload);
      fbId = fbRef.id;
      const caseRef = await addDoc(collection(db, 'recovery_cases'), { ...casePayload, feedbackId: fbId });
      caseId = caseRef.id;
    } catch (fsErr) {
      console.warn('Firestore feedback write warning (stored on server):', fsErr);
    }

    return { feedbackId: fbId, caseId, customerId };
  } catch (err) {
    console.warn('submitFeedbackAndRecovery fallback handling:', err);
    return {
      feedbackId: `fb_${Date.now()}`,
      caseId: `rec_${Date.now()}`,
      customerId: `cust_${Date.now()}`
    };
  }
}

export function subscribeReviews(businessId: string | null, callback: (reviews: Review[]) => void) {
  const path = 'reviews';
  let q = query(collection(db, path));
  if (businessId) {
    q = query(collection(db, path), where('businessId', '==', businessId));
  }
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeFeedback(businessId: string | null, callback: (feedbackList: Feedback[]) => void) {
  const path = 'feedback';
  let q = query(collection(db, path));
  if (businessId) {
    q = query(collection(db, path), where('businessId', '==', businessId));
  }
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Feedback));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

// ==========================================
// CUSTOMERS (CRM)
// ==========================================

export async function upsertCustomerByPhone(params: {
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  rating: number;
  status: Customer['status'];
  internalNotes?: string;
}): Promise<string> {
  const path = 'customers';
  const now = new Date().toISOString();

  let docRef: any = null;
  let existing: Customer | null = null;

  try {
    const q = query(
      collection(db, path),
      where('businessId', '==', params.businessId),
      where('phone', '==', params.phone),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      docRef = snap.docs[0];
      existing = docRef.data() as Customer;
    }
  } catch (lookupErr) {
    console.warn('Customer lookup skipped or not permitted (creating new record):', lookupErr);
  }

  if (docRef && existing) {
    try {
      const newCount = (existing.reviewsCount || 0) + 1;
      const newAvg = Number((((existing.avgRating || params.rating) * (newCount - 1) + params.rating) / newCount).toFixed(1));

      await updateDoc(doc(db, path, docRef.id), sanitizeForFirestore({
        name: params.name || existing.name,
        email: params.email || existing.email || '',
        reviewsCount: newCount,
        lastReviewAt: now,
        avgRating: newAvg,
        status: params.status || existing.status,
        lastInteractionAt: now,
        updatedAt: now
      }));
      return docRef.id;
    } catch (updErr) {
      console.warn('Customer update warning (falling back to new record):', updErr);
    }
  }

  // Create new customer
  try {
    const newCustomer: Omit<Customer, 'id'> = sanitizeForFirestore({
      businessId: params.businessId,
      name: params.name,
      phone: params.phone,
      email: params.email || '',
      reviewsCount: 1,
      lastReviewAt: now,
      avgRating: params.rating,
      status: params.status || 'in_recovery',
      internalNotes: params.internalNotes || '',
      lastInteractionAt: now,
      createdAt: now,
      updatedAt: now
    });
    const ref = await addDoc(collection(db, path), newCustomer);
    return ref.id;
  } catch (createErr) {
    console.warn('Customer addDoc warning:', createErr);
    return `cust_${Date.now().toString(36)}`;
  }
}

export function subscribeCustomers(businessId: string | null, callback: (customers: Customer[]) => void) {
  const path = 'customers';
  let q = query(collection(db, path));
  if (businessId) {
    q = query(collection(db, path), where('businessId', '==', businessId));
  }
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      items.sort((a, b) => new Date(b.lastReviewAt || b.createdAt).getTime() - new Date(a.lastReviewAt || a.createdAt).getTime());
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  const path = `customers/${id}`;
  try {
    await updateDoc(doc(db, 'customers', id), sanitizeForFirestore({
      ...data,
      updatedAt: new Date().toISOString()
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ==========================================
// RECOVERY CASES
// ==========================================

export function subscribeRecoveryCases(businessId: string | null, callback: (cases: RecoveryCase[]) => void) {
  const path = 'recovery_cases';
  let q = query(collection(db, path));
  if (businessId) {
    q = query(collection(db, path), where('businessId', '==', businessId));
  }
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecoveryCase));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function updateRecoveryCaseStatus(
  caseId: string,
  status: RecoveryCaseStatus,
  notes?: string,
  customerId?: string
): Promise<void> {
  const path = `recovery_cases/${caseId}`;
  try {
    const now = new Date().toISOString();
    const updateData: Record<string, any> = sanitizeForFirestore({
      status,
      updatedAt: now,
      ...(status === 'resolvido' || status === 'cliente_recuperado' ? { resolvedAt: now } : {}),
      ...(notes ? { notes } : {})
    });
    await updateDoc(doc(db, 'recovery_cases', caseId), updateData);

    // If customer ID provided, sync customer status
    if (customerId) {
      let customerStatus: Customer['status'] = 'in_recovery';
      if (status === 'cliente_recuperado') customerStatus = 'recovered';
      if (status === 'resolvido') customerStatus = 'active';
      await updateCustomer(customerId, { status: customerStatus, lastInteractionAt: now });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ==========================================
// INTERACTIONS (Contact logs)
// ==========================================

export async function addInteraction(data: Omit<Interaction, 'id' | 'createdAt'>): Promise<string> {
  const path = 'interactions';
  try {
    const payload = sanitizeForFirestore({
      ...data,
      createdAt: new Date().toISOString()
    });
    const ref = await addDoc(collection(db, path), payload);

    // Update customer last interaction
    if (data.customerId) {
      await updateCustomer(data.customerId, { lastInteractionAt: new Date().toISOString() });
    }
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeInteractions(businessId: string | null, callback: (items: Interaction[]) => void) {
  const path = 'interactions';
  let q = query(collection(db, path));
  if (businessId) {
    q = query(collection(db, path), where('businessId', '==', businessId));
  }
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Interaction));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

// ==========================================
// PLANS & SETTINGS
// ==========================================

const DEFAULT_PLANS: Plan[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    price: 99,
    currency: 'BRL',
    maxBusinesses: 1,
    maxReviewsMonth: 200,
    features: [
      '1 Estabelecimento',
      'Página e QR Code de avaliação',
      'CRM de clientes essencial',
      'Gestão de casos de recuperação',
      'Filtro inteligente 1–4 estrelas'
    ],
    isActive: true
  },
  {
    id: 'plan_pro',
    name: 'Profissional',
    price: 199,
    currency: 'BRL',
    maxBusinesses: 3,
    maxReviewsMonth: 1000,
    features: [
      'Até 3 Estabelecimentos',
      'QR Codes personalizados com logo',
      'Integração direta com WhatsApp',
      'CRM completo com histórico de contactos',
      'Notificações instantâneas de feedback',
      'Relatórios e métricas de satisfação'
    ],
    isActive: true
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    price: 399,
    currency: 'BRL',
    maxBusinesses: 10,
    maxReviewsMonth: 5000,
    features: [
      'Até 10 Estabelecimentos / Franquias',
      'Acesso multiusuário para equipas',
      'Automação de follow-up pós-recuperação',
      'Exportação avançada e relatórios',
      'Suporte prioritário e onboarding dedicado'
    ],
    isActive: true
  }
];

const DEFAULT_SETTINGS: PlatformSettings = {
  id: 'global',
  platformName: 'ReputaFlow',
  supportEmail: 'suporte@reputaflow.com',
  defaultGoogleReviewInstructions:
    'Agradecemos a sua avaliação sincera! O seu feedback ajuda outros clientes a conhecer a qualidade do nosso atendimento.',
  allowPublicRegistration: true,
  smsEnabled: true,
  whatsappApiEnabled: true
};

export async function getPlans(): Promise<Plan[]> {
  const path = 'plans';
  try {
    const snap = await getDocs(collection(db, path));
    if (snap.empty) return DEFAULT_PLANS;
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan));
  } catch (err) {
    console.warn("Firestore error loading plans, using local fallbacks", err);
    return DEFAULT_PLANS;
  }
}

export async function savePlan(plan: Plan): Promise<void> {
  const path = `plans/${plan.id}`;
  try {
    await setDoc(doc(db, 'plans', plan.id), plan);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  const path = 'settings/global';
  try {
    const snap = await getDoc(doc(db, 'settings', 'global'));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as PlatformSettings;
    }
    return DEFAULT_SETTINGS;
  } catch (err) {
    console.warn("Firestore error loading global settings, using local fallbacks", err);
    return DEFAULT_SETTINGS;
  }
}

export async function savePlatformSettings(settings: PlatformSettings): Promise<void> {
  const path = 'settings/global';
  try {
    await setDoc(doc(db, 'settings', 'global'), settings);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
