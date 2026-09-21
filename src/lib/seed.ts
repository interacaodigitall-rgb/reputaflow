import {
  collection,
  getDocs,
  setDoc,
  doc,
  addDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { Plan, PlatformSettings, Business } from '../types';

export async function bootstrapSeedData(ownerId: string = 'demo-owner') {
  try {
    // 1. Check if plans exist
    const plansSnap = await getDocs(collection(db, 'plans'));
    if (plansSnap.empty) {
      const defaultPlans: Plan[] = [
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

      for (const p of defaultPlans) {
        await setDoc(doc(db, 'plans', p.id), p);
      }
    }

    // 2. Check settings
    const settingsSnap = await getDocs(collection(db, 'settings'));
    if (settingsSnap.empty) {
      const defaultSettings: PlatformSettings = {
        id: 'global',
        platformName: 'ReputaFlow',
        supportEmail: 'suporte@reputaflow.com',
        defaultGoogleReviewInstructions:
          'Agradecemos a sua avaliação sincera! O seu feedback ajuda outros clientes a conhecer a qualidade do nosso atendimento.',
        allowPublicRegistration: true,
        smsEnabled: true,
        whatsappApiEnabled: true
      };
      await setDoc(doc(db, 'settings', 'global'), defaultSettings);
    }

    // 3. Check businesses
    const bizSnap = await getDocs(collection(db, 'businesses'));
    if (bizSnap.empty) {
      const demoBiz: Omit<Business, 'id'> = {
        name: 'Bistrô & Café Paris',
        slug: 'bistro-paris',
        category: 'Restaurante & Gastronomia',
        logoUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=150&auto=format&fit=crop&q=80',
        phone: '+55 11 98765-4321',
        email: 'contato@bistroparis.com.br',
        address: 'Av. Paulista, 1500 - Bela Vista, São Paulo - SP',
        googleReviewUrl: 'https://g.page/r/bistro-paris/review',
        status: 'active',
        planId: 'plan_pro',
        ownerId: ownerId,
        createdAt: new Date(Date.now() - 15 * 86400000).toISOString(),
        updatedAt: new Date().toISOString()
      };

      const bizRef = await addDoc(collection(db, 'businesses'), demoBiz);
      const bizId = bizRef.id;

      // Seed initial sample reviews and recovery cases
      const seedReviews = [
        {
          businessId: bizId,
          customerName: 'Mariana Silva',
          customerPhone: '+55 11 99123-4567',
          customerEmail: 'mariana.silva@email.com',
          rating: 5,
          channel: 'qr' as const,
          createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
        },
        {
          businessId: bizId,
          customerName: 'Carlos Eduardo',
          customerPhone: '+55 11 98877-6655',
          customerEmail: 'carlos.edu@email.com',
          rating: 5,
          channel: 'link' as const,
          createdAt: new Date(Date.now() - 4 * 86400000).toISOString()
        },
        {
          businessId: bizId,
          customerName: 'Beatriz Costa',
          customerPhone: '+55 11 97711-2233',
          customerEmail: 'beatriz.costa@email.com',
          rating: 3,
          channel: 'qr' as const,
          createdAt: new Date(Date.now() - 1 * 86400000).toISOString()
        },
        {
          businessId: bizId,
          customerName: 'Rodrigo Lima',
          customerPhone: '+55 11 96543-2109',
          customerEmail: 'rodrigo.lima@email.com',
          rating: 2,
          channel: 'qr' as const,
          createdAt: new Date(Date.now() - 6 * 86400000).toISOString()
        }
      ];

      for (const rev of seedReviews) {
        const revRef = await addDoc(collection(db, 'reviews'), rev);
        
        // If rating <= 4, create customer, feedback, and recovery case
        if (rev.rating <= 4) {
          const custRef = await addDoc(collection(db, 'customers'), {
            businessId: bizId,
            name: rev.customerName,
            phone: rev.customerPhone,
            email: rev.customerEmail,
            reviewsCount: 1,
            lastReviewAt: rev.createdAt,
            avgRating: rev.rating,
            status: rev.rating === 3 ? 'in_recovery' : 'recovered',
            internalNotes: rev.rating === 3 ? 'Reclamou da demora no almoço executivo.' : 'Cliente relatou prato frio, recebeu cortesia de sobremesa.',
            lastInteractionAt: new Date().toISOString(),
            createdAt: rev.createdAt,
            updatedAt: new Date().toISOString()
          });

          const q1 = rev.rating === 3 
            ? 'O pedido do almoço demorou quase 40 minutos para ser entregue.' 
            : 'A comida veio morna e faltou um acompanhamento.';
          const q2 = rev.rating === 3 
            ? 'Ter mais agilidade no horário de pico do almoço.' 
            : 'Mais atenção na checagem dos pedidos antes de sair da cozinha.';

          const fbRef = await addDoc(collection(db, 'feedback'), {
            businessId: bizId,
            reviewId: revRef.id,
            customerId: custRef.id,
            customerName: rev.customerName,
            customerPhone: rev.customerPhone,
            customerEmail: rev.customerEmail,
            rating: rev.rating,
            question1: q1,
            question2: q2,
            question3WantsContact: true,
            createdAt: rev.createdAt
          });

          await addDoc(collection(db, 'recovery_cases'), {
            businessId: bizId,
            customerId: custRef.id,
            reviewId: revRef.id,
            feedbackId: fbRef.id,
            customerName: rev.customerName,
            customerPhone: rev.customerPhone,
            customerEmail: rev.customerEmail,
            rating: rev.rating,
            status: rev.rating === 3 ? 'novo' : 'cliente_recuperado',
            notes: `Q1: ${q1}\nQ2: ${q2}\nContacto solicitado: Sim`,
            resolvedAt: rev.rating === 2 ? new Date().toISOString() : undefined,
            createdAt: rev.createdAt,
            updatedAt: new Date().toISOString()
          });

          // Add sample interaction
          if (rev.rating === 2) {
            await addDoc(collection(db, 'interactions'), {
              businessId: bizId,
              customerId: custRef.id,
              type: 'whatsapp',
              summary: 'Entramos em contacto via WhatsApp explicando o ocorrido e oferecendo um voucher de 20% para a próxima visita.',
              outcome: 'Cliente aceitou gentilmente e agradeceu o retorno rápido.',
              staffEmail: 'gerente@bistroparis.com.br',
              staffName: 'Lucas Gerente',
              createdAt: new Date().toISOString()
            });
          }
        } else {
          // 5-star customer
          await addDoc(collection(db, 'customers'), {
            businessId: bizId,
            name: rev.customerName,
            phone: rev.customerPhone,
            email: rev.customerEmail,
            reviewsCount: 1,
            lastReviewAt: rev.createdAt,
            avgRating: 5,
            status: 'active',
            internalNotes: 'Cliente muito satisfeito, elogiou a carta de vinhos.',
            lastInteractionAt: rev.createdAt,
            createdAt: rev.createdAt,
            updatedAt: rev.createdAt
          });
        }
      }
    }
  } catch (err) {
    console.warn('Seed initialization error (ignoring if restricted):', err);
  }
}
