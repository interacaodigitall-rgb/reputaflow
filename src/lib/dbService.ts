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
import { db, handleFirestoreError, OperationType } from './firebase';
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
// BUSINESSES
// ==========================================

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const path = 'businesses';
  try {
    const q = query(collection(db, path), where('slug', '==', slug), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...d.data() } as Business;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function getBusinessById(id: string): Promise<Business | null> {
  const path = `businesses/${id}`;
  try {
    const snap = await getDoc(doc(db, 'businesses', id));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Business;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function getAllBusinesses(): Promise<Business[]> {
  const path = 'businesses';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Business));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export function subscribeBusinesses(callback: (businesses: Business[]) => void) {
  const path = 'businesses';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Business));
      callback(items);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createBusiness(data: Omit<Business, 'id'>, customId?: string): Promise<string> {
  const path = 'businesses';
  try {
    const cleanSlug = data.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const payload = {
      ...data,
      slug: cleanSlug,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (customId) {
      await setDoc(doc(db, path, customId), payload);
      return customId;
    } else {
      const ref = await addDoc(collection(db, path), payload);
      return ref.id;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateBusiness(id: string, data: Partial<Business>): Promise<void> {
  const path = `businesses/${id}`;
  try {
    const payload = {
      ...data,
      updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'businesses', id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteBusiness(id: string): Promise<void> {
  const path = `businesses/${id}`;
  try {
    await deleteDoc(doc(db, 'businesses', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ==========================================
// REVIEWS & FEEDBACK
// ==========================================

export async function submitReview(
  data: Omit<Review, 'id' | 'createdAt'>
): Promise<{ reviewId: string }> {
  const path = 'reviews';
  try {
    const payload = {
      ...data,
      createdAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, path), payload);
    return { reviewId: ref.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
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
    const feedbackPayload = {
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
    };
    const fbRef = await addDoc(collection(db, 'feedback'), feedbackPayload);

    // 3. Create Recovery Case in CRM
    const casePayload: Omit<RecoveryCase, 'id'> = {
      businessId: params.businessId,
      customerId,
      reviewId: params.reviewId,
      feedbackId: fbRef.id,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      customerEmail: params.customerEmail || '',
      rating: params.rating,
      status: 'novo',
      notes: `Q1: ${params.question1}\nQ2: ${params.question2}\nContacto solicitado: ${params.question3WantsContact ? 'Sim' : 'Não'}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const caseRef = await addDoc(collection(db, 'recovery_cases'), casePayload);

    return { feedbackId: fbRef.id, caseId: caseRef.id, customerId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'feedback_and_recovery');
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
  try {
    const q = query(
      collection(db, path),
      where('businessId', '==', params.businessId),
      where('phone', '==', params.phone),
      limit(1)
    );
    const snap = await getDocs(q);
    const now = new Date().toISOString();

    if (!snap.empty) {
      const docRef = snap.docs[0];
      const existing = docRef.data() as Customer;
      const newCount = (existing.reviewsCount || 0) + 1;
      const newAvg = Number((((existing.avgRating || params.rating) * (newCount - 1) + params.rating) / newCount).toFixed(1));

      await updateDoc(doc(db, path, docRef.id), {
        name: params.name || existing.name,
        email: params.email || existing.email || '',
        reviewsCount: newCount,
        lastReviewAt: now,
        avgRating: newAvg,
        status: params.status || existing.status,
        lastInteractionAt: now,
        updatedAt: now
      });
      return docRef.id;
    } else {
      const newCustomer: Omit<Customer, 'id'> = {
        businessId: params.businessId,
        name: params.name,
        phone: params.phone,
        email: params.email || '',
        reviewsCount: 1,
        lastReviewAt: now,
        avgRating: params.rating,
        status: params.status,
        internalNotes: params.internalNotes || '',
        lastInteractionAt: now,
        createdAt: now,
        updatedAt: now
      };
      const ref = await addDoc(collection(db, path), newCustomer);
      return ref.id;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
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
    await updateDoc(doc(db, 'customers', id), {
      ...data,
      updatedAt: new Date().toISOString()
    });
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
    const updateData: Record<string, any> = {
      status,
      updatedAt: now
    };
    if (status === 'resolvido' || status === 'cliente_recuperado') {
      updateData.resolvedAt = now;
    }
    if (notes) {
      updateData.notes = notes;
    }
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
    const payload = {
      ...data,
      createdAt: new Date().toISOString()
    };
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

export async function getPlans(): Promise<Plan[]> {
  const path = 'plans';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Plan));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
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
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
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
