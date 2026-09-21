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
  } catch (err) {
    console.warn('bootstrapSeedData warning:', err);
  }
}
