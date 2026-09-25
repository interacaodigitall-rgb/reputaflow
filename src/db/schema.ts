import { pgTable, text, integer, boolean, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table (linked to Firebase Auth UID)
export const users = pgTable('users', {
  id: text('id').primaryKey(), // Firebase Auth UID or internal ID
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').default('merchant').notNull(), // 'super_admin' | 'merchant' | 'staff'
  businessId: text('business_id'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Businesses table
export const businesses = pgTable('businesses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category'),
  logoUrl: text('logo_url'),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  address: text('address').notNull(),
  googleReviewUrl: text('google_review_url'),
  status: text('status').default('active').notNull(), // 'active' | 'pending' | 'suspended'
  planId: text('plan_id').default('plan_pro').notNull(),
  ownerId: text('owner_id').default('owner_default').notNull(),
  currency: text('currency').default('EUR').notNull(), // 'EUR' | 'BRL'
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Customers table
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  reviewsCount: integer('reviews_count').default(1).notNull(),
  lastReviewAt: timestamp('last_review_at').defaultNow().notNull(),
  avgRating: doublePrecision('avg_rating').default(5.0).notNull(),
  status: text('status').default('active').notNull(), // 'active' | 'in_recovery' | 'recovered' | 'churned'
  internalNotes: text('internal_notes'),
  lastInteractionAt: timestamp('last_interaction_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Reviews table
export const reviews = pgTable('reviews', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerEmail: text('customer_email'),
  rating: integer('rating').notNull(), // 1 to 5
  channel: text('channel').default('qr').notNull(), // 'qr' | 'link' | 'sms' | 'email'
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Feedback table
export const feedback = pgTable('feedback', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  reviewId: text('review_id').notNull(),
  customerId: text('customer_id'),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email'),
  rating: integer('rating').notNull(),
  question1: text('question_1').notNull(),
  question2: text('question_2').notNull(),
  question3WantsContact: boolean('question_3_wants_contact').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Recovery Cases table
export const recoveryCases = pgTable('recovery_cases', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  customerId: text('customer_id'),
  reviewId: text('review_id').notNull(),
  feedbackId: text('feedback_id'),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email'),
  rating: integer('rating').notNull(),
  status: text('status').default('novo').notNull(), // 'novo' | 'em_contacto' | 'em_resolucao' | 'resolvido' | 'cliente_recuperado'
  notes: text('notes'),
  assignedTo: text('assigned_to'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Interactions table
export const interactions = pgTable('interactions', {
  id: text('id').primaryKey(),
  businessId: text('business_id').notNull(),
  customerId: text('customer_id'),
  caseId: text('case_id'),
  type: text('type').notNull(), // 'whatsapp' | 'call' | 'email' | 'note'
  summary: text('summary').notNull(),
  outcome: text('outcome'),
  staffEmail: text('staff_email').notNull(),
  staffName: text('staff_name'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Plans table
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: doublePrecision('price').notNull(),
  currency: text('currency').default('EUR').notNull(),
  maxBusinesses: integer('max_businesses').default(1).notNull(),
  maxReviewsMonth: integer('max_reviews_month').default(500).notNull(),
  features: text('features'), // JSON string array
  isActive: boolean('is_active').default(true).notNull()
});

// Platform Settings table
export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey(),
  platformName: text('platform_name').default('ReputaFlow').notNull(),
  supportEmail: text('support_email').default('suporte@reputaflow.com').notNull(),
  defaultGoogleReviewInstructions: text('default_google_review_instructions'),
  allowPublicRegistration: boolean('allow_public_registration').default(true).notNull(),
  smsEnabled: boolean('sms_enabled').default(false).notNull(),
  whatsappApiEnabled: boolean('whatsapp_api_enabled').default(false).notNull()
});

// Relations
export const businessRelations = relations(businesses, ({ many }) => ({
  customers: many(customers),
  reviews: many(reviews),
  feedback: many(feedback),
  recoveryCases: many(recoveryCases),
  interactions: many(interactions)
}));
