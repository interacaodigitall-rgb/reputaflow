import { Business, Review, Feedback, Customer, RecoveryCase } from '../types';

export const REGISTERED_BUSINESSES: Business[] = [
  {
    id: 'biz_sbk_barbershop',
    name: 'SBK BARBERSHOP',
    slug: 'sbk-barbershop',
    category: 'Barbearia & Estética',
    logoUrl: '',
    phone: '',
    email: 'contato@sbkbarbershop.com',
    address: '',
    googleReviewUrl: '',
    status: 'active',
    planId: 'plan_pro',
    ownerId: 'owner_sbk_barbershop',
    currency: 'EUR',
    password: 'reputa123',
    minRatingForGoogle: 4,
    qrThemeColor: '#4285F4',
    activePlan: 'pro',
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z'
  },
  {
    id: 'biz_mrnavalha',
    name: 'Mr. Navalha',
    slug: 'mrnavalha',
    category: 'Barbearia & Estética',
    logoUrl: 'https://i.postimg.cc/h4YbXjCk/MISTER-VETOR-removebg-preview.png',
    phone: '+351 937 472 634',
    email: 'contacto@misternavalha.com',
    address: 'R. António Sérgio 20, 6300-685 Guarda, Portugal',
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJtRX8AEj7PA0Rp4bh2umMy6k',
    status: 'active',
    planId: 'plan_pro',
    ownerId: 'owner_mrnavalha',
    currency: 'EUR',
    password: 'reputa123',
    minRatingForGoogle: 4,
    qrThemeColor: '#4285F4',
    activePlan: 'pro',
    createdAt: '2026-08-22T10:40:37.506Z',
    updatedAt: '2026-09-21T13:01:24.346Z'
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust_teste',
    businessId: 'biz_mrnavalha',
    name: 'Cliente Teste',
    phone: '+351 919999999',
    email: 'clienteteste@gmail.com',
    reviewsCount: 1,
    lastReviewAt: '2026-09-21T10:40:42.283Z',
    avgRating: 5,
    status: 'active',
    createdAt: '2026-09-21T10:40:42.283Z',
    updatedAt: '2026-09-21T10:40:42.283Z'
  },
  {
    id: 'cust_1',
    businessId: 'biz_mrnavalha',
    name: 'Tiago Santos',
    phone: '+351 923 456 789',
    email: 'tiago@email.pt',
    reviewsCount: 1,
    lastReviewAt: '2026-09-20T10:40:37.507Z',
    avgRating: 5,
    status: 'active',
    createdAt: '2026-09-20T10:40:37.507Z',
    updatedAt: '2026-09-20T10:40:37.507Z'
  },
  {
    id: 'cust_2',
    businessId: 'biz_mrnavalha',
    name: 'Diogo Ribeiro',
    phone: '+351 934 567 890',
    email: 'diogo@email.pt',
    reviewsCount: 1,
    lastReviewAt: '2026-09-18T10:40:37.507Z',
    avgRating: 3,
    status: 'in_recovery',
    internalNotes: 'Cliente teve tempo de espera prolongado na barba. Em contacto para resolução.',
    createdAt: '2026-09-18T10:40:37.507Z',
    updatedAt: '2026-09-21T10:40:37.507Z'
  }
];

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 'rev_mub46rl7_as6n',
    businessId: 'biz_mrnavalha',
    customerName: 'Cliente Teste',
    customerPhone: '+351 919999999',
    customerEmail: 'clienteteste@gmail.com',
    rating: 5,
    channel: 'qr',
    createdAt: '2026-09-21T10:40:42.283Z'
  },
  {
    id: 'rev_1',
    businessId: 'biz_mrnavalha',
    customerName: 'Tiago Santos',
    customerPhone: '+351 923 456 789',
    customerEmail: 'tiago@email.pt',
    rating: 5,
    channel: 'qr',
    createdAt: '2026-09-20T10:40:37.507Z'
  },
  {
    id: 'rev_2',
    businessId: 'biz_mrnavalha',
    customerName: 'Diogo Ribeiro',
    customerPhone: '+351 934 567 890',
    customerEmail: 'diogo@email.pt',
    rating: 3,
    channel: 'qr',
    createdAt: '2026-09-18T10:40:37.507Z'
  }
];

export const INITIAL_FEEDBACK: Feedback[] = [
  {
    id: 'fb_1',
    businessId: 'biz_mrnavalha',
    reviewId: 'rev_2',
    customerName: 'Diogo Ribeiro',
    customerPhone: '+351 934 567 890',
    customerEmail: 'diogo@email.pt',
    rating: 3,
    question1: 'O tempo de espera para a barba foi um pouco acima do agendado.',
    question2: 'Avisar por mensagem se houver atrasos na cadeira.',
    question3WantsContact: true,
    createdAt: '2026-09-18T10:40:37.507Z'
  }
];

export const INITIAL_RECOVERY_CASES: RecoveryCase[] = [
  {
    id: 'rec_1',
    businessId: 'biz_mrnavalha',
    reviewId: 'rev_2',
    feedbackId: 'fb_1',
    customerName: 'Diogo Ribeiro',
    customerPhone: '+351 934 567 890',
    customerEmail: 'diogo@email.pt',
    rating: 3,
    notes: 'O tempo de espera para a barba foi um pouco acima do agendado.',
    status: 'novo',
    createdAt: '2026-09-18T10:40:37.507Z',
    updatedAt: '2026-09-21T10:40:37.507Z'
  }
];
