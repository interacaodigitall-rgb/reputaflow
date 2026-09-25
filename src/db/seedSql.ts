import { db } from './index.ts';
import { businesses, plans, platformSettings, reviews, feedback, customers, recoveryCases } from './schema.ts';
import { REGISTERED_BUSINESSES, INITIAL_REVIEWS, INITIAL_FEEDBACK, INITIAL_CUSTOMERS, INITIAL_RECOVERY_CASES } from '../lib/initialData.ts';

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

    // 4. Initial reviews & feedback & customers
    const existingReviews = await db.select().from(reviews);
    if (existingReviews.length === 0) {
      for (const r of INITIAL_REVIEWS) {
        await db.insert(reviews).values({
          id: r.id,
          businessId: r.businessId,
          customerId: r.customerId,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          customerEmail: r.customerEmail,
          rating: r.rating,
          channel: r.channel,
          createdAt: new Date(r.createdAt)
        }).onConflictDoNothing();
      }

      for (const c of INITIAL_CUSTOMERS) {
        await db.insert(customers).values({
          id: c.id,
          businessId: c.businessId,
          name: c.name,
          phone: c.phone,
          email: c.email,
          reviewsCount: c.reviewsCount,
          lastReviewAt: new Date(c.lastReviewAt),
          avgRating: c.avgRating,
          status: c.status,
          internalNotes: c.internalNotes,
          createdAt: new Date(c.createdAt),
          updatedAt: new Date(c.updatedAt || c.createdAt)
        }).onConflictDoNothing();
      }

      for (const f of INITIAL_FEEDBACK) {
        await db.insert(feedback).values({
          id: f.id,
          businessId: f.businessId,
          reviewId: f.reviewId,
          customerId: f.customerId,
          customerName: f.customerName,
          customerPhone: f.customerPhone,
          customerEmail: f.customerEmail,
          rating: f.rating,
          question1: f.question1,
          question2: f.question2,
          question3WantsContact: f.question3WantsContact,
          createdAt: new Date(f.createdAt)
        }).onConflictDoNothing();
      }

      for (const rc of INITIAL_RECOVERY_CASES) {
        await db.insert(recoveryCases).values({
          id: rc.id,
          businessId: rc.businessId,
          customerId: rc.customerId,
          reviewId: rc.reviewId,
          feedbackId: rc.feedbackId,
          customerName: rc.customerName,
          customerPhone: rc.customerPhone,
          customerEmail: rc.customerEmail,
          rating: rc.rating,
          status: rc.status,
          notes: rc.notes,
          assignedTo: rc.assignedTo,
          createdAt: new Date(rc.createdAt),
          updatedAt: new Date(rc.updatedAt || rc.createdAt)
        }).onConflictDoNothing();
      }
    }
  } catch (err) {
    console.warn('Database seeding warning:', err);
  }
}
