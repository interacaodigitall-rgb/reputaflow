import { Business, Review, Feedback, Customer, RecoveryCase } from '../types';

export const REGISTERED_BUSINESSES: Business[] = [
  {
    id: 'biz_mrnavalha',
    name: 'Mr. Navalha',
    slug: 'mrnavalha',
    category: 'Barbearia & Estética',
    logoUrl: 'https://i.postimg.cc/h4YbXjcK/MISTER-VETOR-removebg-preview.png',
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

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 'rev_1',
    businessId: 'biz_mrnavalha',
    rating: 5,
    channel: 'qr',
    customerName: 'João Silva',
    customerPhone: '+351 912 345 678',
    customerEmail: 'joao.silva@gmail.com',
    createdAt: '2026-09-20T14:30:00.000Z'
  },
  {
    id: 'rev_2',
    businessId: 'biz_mrnavalha',
    rating: 5,
    channel: 'link',
    customerName: 'Carlos Oliveira',
    customerPhone: '+351 923 456 789',
    customerEmail: 'carlos.m@hotmail.com',
    createdAt: '2026-09-19T11:15:00.000Z'
  },
  {
    id: 'rev_3',
    businessId: 'biz_mrnavalha',
    rating: 4,
    channel: 'qr',
    customerName: 'Afonso Santos',
    customerPhone: '+351 934 567 890',
    customerEmail: 'afonso.santos@outlook.com',
    createdAt: '2026-09-18T16:45:00.000Z'
  },
  {
    id: 'rev_4',
    businessId: 'biz_mrnavalha',
    rating: 2,
    channel: 'qr',
    customerName: 'Miguel Ferreira',
    customerPhone: '+351 965 432 109',
    customerEmail: 'miguel.ferreira@gmail.com',
    createdAt: '2026-09-17T09:20:00.000Z'
  },
  {
    id: 'rev_5',
    businessId: 'biz_mrnavalha',
    rating: 5,
    channel: 'link',
    customerName: 'Diogo Costa',
    customerPhone: '+351 919 876 543',
    customerEmail: 'diogo.costa@sapo.pt',
    createdAt: '2026-09-15T18:10:00.000Z'
  }
];

export const INITIAL_FEEDBACK: Feedback[] = [
  {
    id: 'fb_1',
    businessId: 'biz_mrnavalha',
    reviewId: 'rev_4',
    customerId: 'cust_4',
    customerName: 'Miguel Ferreira',
    customerPhone: '+351 965 432 109',
    customerEmail: 'miguel.ferreira@gmail.com',
    rating: 2,
    question1: 'O tempo de espera com agendamento prévio foi de 30 minutos e o acabamento da barba não ficou conforme pedido.',
    question2: 'Melhorar a pontualidade nos horários marcados.',
    question3WantsContact: true,
    createdAt: '2026-09-17T09:22:00.000Z'
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust_1',
    businessId: 'biz_mrnavalha',
    name: 'João Silva',
    phone: '+351 912 345 678',
    email: 'joao.silva@gmail.com',
    avgRating: 5,
    reviewsCount: 1,
    lastReviewAt: '2026-09-20T14:30:00.000Z',
    status: 'active',
    internalNotes: 'Cliente habitual, prefere o barbeiro Pedro.',
    createdAt: '2026-09-20T14:30:00.000Z',
    updatedAt: '2026-09-20T14:30:00.000Z'
  },
  {
    id: 'cust_2',
    businessId: 'biz_mrnavalha',
    name: 'Carlos Oliveira',
    phone: '+351 923 456 789',
    email: 'carlos.m@hotmail.com',
    avgRating: 5,
    reviewsCount: 1,
    lastReviewAt: '2026-09-19T11:15:00.000Z',
    status: 'active',
    internalNotes: '',
    createdAt: '2026-09-19T11:15:00.000Z',
    updatedAt: '2026-09-19T11:15:00.000Z'
  },
  {
    id: 'cust_3',
    businessId: 'biz_mrnavalha',
    name: 'Afonso Santos',
    phone: '+351 934 567 890',
    email: 'afonso.santos@outlook.com',
    avgRating: 4,
    reviewsCount: 1,
    lastReviewAt: '2026-09-18T16:45:00.000Z',
    status: 'active',
    internalNotes: '',
    createdAt: '2026-09-18T16:45:00.000Z',
    updatedAt: '2026-09-18T16:45:00.000Z'
  },
  {
    id: 'cust_4',
    businessId: 'biz_mrnavalha',
    name: 'Miguel Ferreira',
    phone: '+351 965 432 109',
    email: 'miguel.ferreira@gmail.com',
    avgRating: 2,
    reviewsCount: 1,
    lastReviewAt: '2026-09-17T09:20:00.000Z',
    status: 'in_recovery',
    internalNotes: 'Reclamação de atraso no atendimento em 17/09.',
    createdAt: '2026-09-17T09:20:00.000Z',
    updatedAt: '2026-09-17T09:20:00.000Z'
  },
  {
    id: 'cust_5',
    businessId: 'biz_mrnavalha',
    name: 'Diogo Costa',
    phone: '+351 919 876 543',
    email: 'diogo.costa@sapo.pt',
    avgRating: 5,
    reviewsCount: 1,
    lastReviewAt: '2026-09-15T18:10:00.000Z',
    status: 'active',
    internalNotes: '',
    createdAt: '2026-09-15T18:10:00.000Z',
    updatedAt: '2026-09-15T18:10:00.000Z'
  }
];

export const INITIAL_RECOVERY_CASES: RecoveryCase[] = [
  {
    id: 'rec_1',
    businessId: 'biz_mrnavalha',
    customerId: 'cust_4',
    reviewId: 'rev_4',
    feedbackId: 'fb_1',
    customerName: 'Miguel Ferreira',
    customerPhone: '+351 965 432 109',
    customerEmail: 'miguel.ferreira@gmail.com',
    rating: 2,
    notes: 'Atraso de 30 min e corte de barba diferente do solicitado.',
    status: 'novo',
    assignedTo: '',
    createdAt: '2026-09-17T09:22:00.000Z',
    updatedAt: '2026-09-17T09:22:00.000Z'
  }
];

