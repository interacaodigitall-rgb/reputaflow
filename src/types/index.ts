export type UserRole = 'super_admin' | 'merchant' | 'staff';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  businessId?: string;
  photoURL?: string;
  createdAt: string;
  updatedAt?: string;
}

export type BusinessStatus = 'active' | 'pending' | 'suspended';

export interface Business {
  id: string;
  name: string;
  slug: string;
  category?: string;
  logoUrl?: string;
  phone: string;
  email: string;
  address: string;
  googleReviewUrl?: string;
  status: BusinessStatus;
  planId: string;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
  currency?: 'EUR' | 'BRL';
}

export type CustomerStatus = 'active' | 'in_recovery' | 'recovered' | 'churned';

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  reviewsCount: number;
  lastReviewAt: string;
  avgRating: number;
  status: CustomerStatus;
  internalNotes?: string;
  lastInteractionAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Review {
  id: string;
  businessId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  rating: number; // 1 to 5
  channel: 'qr' | 'link' | 'sms' | 'email';
  createdAt: string;
}

export interface Feedback {
  id: string;
  businessId: string;
  reviewId: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  rating: number;
  question1: string; // "O que aconteceu?"
  question2: string; // "O que poderíamos melhorar?"
  question3WantsContact: boolean; // "Gostaria que a nossa equipa entrasse em contacto consigo?"
  createdAt: string;
}

export type RecoveryCaseStatus =
  | 'novo'
  | 'em_contacto'
  | 'em_resolucao'
  | 'resolvido'
  | 'cliente_recuperado';

export interface RecoveryCase {
  id: string;
  businessId: string;
  customerId?: string;
  reviewId: string;
  feedbackId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  rating: number;
  status: RecoveryCaseStatus;
  notes?: string;
  assignedTo?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type InteractionType = 'whatsapp' | 'call' | 'email' | 'note';

export interface Interaction {
  id: string;
  businessId: string;
  customerId?: string;
  caseId?: string;
  type: InteractionType;
  summary: string;
  outcome?: string;
  staffEmail: string;
  staffName?: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  maxBusinesses: number;
  maxReviewsMonth: number;
  features: string[];
  isActive: boolean;
}

export interface PlatformSettings {
  id: string;
  platformName: string;
  supportEmail: string;
  defaultGoogleReviewInstructions: string;
  allowPublicRegistration: boolean;
  smsEnabled?: boolean;
  whatsappApiEnabled?: boolean;
}
