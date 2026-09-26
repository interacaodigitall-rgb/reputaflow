import { Business, Review, Feedback, Customer, RecoveryCase } from '../types';

export const REGISTERED_BUSINESSES: Business[] = [
  {
    id: 'biz_mrnavalha',
    name: 'Mr. Navalha',
    slug: 'mrnavalha',
    category: 'Barbearia & Estética',
    logoUrl: '',
    phone: '+351 937 472 634',
    email: 'contacto@misternavalha.com',
    address: 'R. António Sérgio 20, 6300-685 Guarda, Portugal',
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJtrX8AEj7PA0Rp4bh2umMy6k',
    status: 'active',
    planId: 'plan_pro',
    ownerId: 'owner_mrnavalha',
    currency: 'EUR',
    password: 'reputa123',
    createdAt: '2026-08-22T10:40:37.506Z',
    updatedAt: '2026-09-21T10:40:37.506Z'
  }
];

// ZERO MOCK DATA - ONLY REAL SUPABASE DATA
export const INITIAL_REVIEWS: Review[] = [];
export const INITIAL_FEEDBACK: Feedback[] = [];
export const INITIAL_CUSTOMERS: Customer[] = [];
export const INITIAL_RECOVERY_CASES: RecoveryCase[] = [];
