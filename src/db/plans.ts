import { db } from './index.ts';
import { plans, platformSettings } from './schema.ts';
import { eq } from 'drizzle-orm';

const inMemoryPlans: any[] = [
  {
    id: 'plan_starter',
    name: 'Starter',
    price: '99',
    currency: 'BRL',
    interval: 'monthly',
    maxBusinesses: 1,
    maxReviewsMonth: 100,
    features: ['1 Estabelecimento', 'Até 100 avaliações/mês', 'QR Code de Mesa', 'Dashboard Básico'],
    stripePriceId: null
  },
  {
    id: 'plan_pro',
    name: 'Profissional',
    price: '199',
    currency: 'BRL',
    interval: 'monthly',
    maxBusinesses: 3,
    maxReviewsMonth: 500,
    features: ['3 Estabelecimentos', 'Até 500 avaliações/mês', 'Filtro Inteligente 4-5★', 'CRM de Recuperação', 'Suporte Prioritário'],
    stripePriceId: null
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    price: '399',
    currency: 'BRL',
    interval: 'monthly',
    maxBusinesses: 10,
    maxReviewsMonth: 2000,
    features: ['10 Estabelecimentos', 'Avaliações Ilimitadas', 'Gestor de Conta Dedicado', 'Integrações Personalizadas', 'White-Label Completo'],
    stripePriceId: null
  }
];

const inMemorySettings: any = {
  id: 'settings_default',
  platformName: 'ReputaFlow',
  supportEmail: 'suporte@reputaflow.com',
  defaultCurrency: 'EUR',
  minRatingForGoogle: 4,
  allowRegistrations: true,
  stripePublishableKey: null,
  geminiApiKey: null,
  updatedAt: new Date()
};

export async function getPlansSql() {
  try {
    const list = await db.select().from(plans);
    if (list && list.length > 0) {
      return list.map((p) => ({
        ...p,
        features: p.features ? (typeof p.features === 'string' ? JSON.parse(p.features) : p.features) : []
      }));
    }
  } catch (error) {
    console.warn('[getPlansSql] Cloud SQL fallback to default plans');
  }
  return inMemoryPlans;
}

export async function getPlatformSettingsSql() {
  try {
    const list = await db.select().from(platformSettings);
    if (list && list[0]) {
      return list[0];
    }
  } catch (error) {
    console.warn('[getPlatformSettingsSql] Cloud SQL fallback to default platform settings');
  }
  return inMemorySettings;
}
