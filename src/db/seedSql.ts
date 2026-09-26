import { db } from './index.ts';
import { businesses, plans, platformSettings } from './schema.ts';
import { REGISTERED_BUSINESSES } from '../lib/initialData.ts';

export async function seedCloudSqlDatabase() {
  try {
    // 1. Check businesses
    const existingBusinesses = await db.select().from(businesses);
    if (existingBusinesses.length === 0) {
      for (const b of REGISTERED_BUSINESSES) {
        await db.insert(businesses).values({
          id: b.id,
          name: b.name,
          slug: b.slug,
          category: b.category,
          logoUrl: b.logoUrl,
          phone: b.phone,
          email: b.email,
          address: b.address,
          googleReviewUrl: b.googleReviewUrl,
          status: b.status,
          planId: b.planId,
          ownerId: b.ownerId,
          currency: b.currency || 'EUR',
          password: b.password || 'reputa123',
          createdAt: new Date(b.createdAt),
          updatedAt: new Date(b.updatedAt || b.createdAt)
        }).onConflictDoNothing();
      }
    }

    // 2. Check plans
    const existingPlans = await db.select().from(plans);
    if (existingPlans.length === 0) {
      const defaultPlans = [
        {
          id: 'plan_starter',
          name: 'Starter',
          price: 99,
          currency: 'EUR',
          maxBusinesses: 1,
          maxReviewsMonth: 200,
          features: JSON.stringify([
            '1 Estabelecimento',
            'Página e QR Code de avaliação',
            'CRM de clientes essencial',
            'Gestão de casos de recuperação',
            'Filtro inteligente 1–4 estrelas'
          ]),
          isActive: true
        },
        {
          id: 'plan_pro',
          name: 'Profissional',
          price: 199,
          currency: 'EUR',
          maxBusinesses: 3,
          maxReviewsMonth: 1000,
          features: JSON.stringify([
            'Até 3 Estabelecimentos',
            'QR Codes personalizados com logo',
            'Integração direta com WhatsApp',
            'CRM completo com histórico de contactos',
            'Notificações instantâneas de feedback',
            'Relatórios e métricas de satisfação'
          ]),
          isActive: true
        },
        {
          id: 'plan_enterprise',
          name: 'Enterprise',
          price: 399,
          currency: 'EUR',
          maxBusinesses: 10,
          maxReviewsMonth: 5000,
          features: JSON.stringify([
            'Até 10 Estabelecimentos / Franquias',
            'Acesso multiusuário para equipas',
            'Automação de follow-up pós-recuperação',
            'Exportação avançada e relatórios',
            'Suporte prioritário e onboarding dedicado'
          ]),
          isActive: true
        }
      ];

      for (const p of defaultPlans) {
        await db.insert(plans).values(p).onConflictDoNothing();
      }
    }

    // 3. Check platform settings
    const existingSettings = await db.select().from(platformSettings);
    if (existingSettings.length === 0) {
      await db.insert(platformSettings).values({
        id: 'global',
        platformName: 'ReputaFlow',
        supportEmail: 'suporte@reputaflow.com',
        defaultGoogleReviewInstructions: 'Agradecemos a sua avaliação sincera!',
        allowPublicRegistration: true,
        smsEnabled: true,
        whatsappApiEnabled: true
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.warn('Database seeding warning:', err);
  }
}
