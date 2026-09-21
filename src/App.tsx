import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { QrCodeModal } from './components/common/QrCodeModal';
import { PublicReviewPage } from './components/public/PublicReviewPage';
import { LoginPage } from './components/common/LoginPage';
import { MerchantDashboard } from './components/merchant/MerchantDashboard';
import { MerchantCRM } from './components/merchant/MerchantCRM';
import { MerchantRecovery } from './components/merchant/MerchantRecovery';
import { MerchantReviews } from './components/merchant/MerchantReviews';
import { MerchantSettings } from './components/merchant/MerchantSettings';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import {
  Review,
  Feedback,
  Customer,
  RecoveryCase,
  Interaction,
  Plan,
  PlatformSettings,
  Business
} from './types';
import {
  subscribeReviews,
  subscribeFeedback,
  subscribeCustomers,
  subscribeRecoveryCases,
  subscribeInteractions,
  getPlans,
  getPlatformSettings
} from './lib/dbService';
import { extractReviewSlug } from './lib/urlHelper';
import { ArrowLeft, ShieldAlert } from 'lucide-react';

function MainAppContent() {
  const {
    currentUser,
    selectedBusiness,
    setSelectedBusiness,
    businesses,
    currentRole,
    setCurrentRole,
    isSuperAdmin,
    loading: authLoading
  } = useAuth();

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showQrModal, setShowQrModal] = useState(false);
  const [isCustomerViewMode, setIsCustomerViewMode] = useState(false);
  const [reviewSlugFromUrl, setReviewSlugFromUrl] = useState<string | null>(null);

  // Business-specific data
  const [reviews, setReviews] = useState<Review[]>([]);
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recoveryCases, setRecoveryCases] = useState<RecoveryCase[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);

  // Super Admin global data
  const [allReviews, setAllReviews] = useState<Review[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allRecoveryCases, setAllRecoveryCases] = useState<RecoveryCase[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);

  // Check URL parameters on mount and when history changes (?b=slug or ?review=slug)
  useEffect(() => {
    const handleUrlChange = () => {
      const bSlug = extractReviewSlug();
      if (bSlug) {
        setReviewSlugFromUrl(bSlug);
        setIsCustomerViewMode(true);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Subscribe to Business-specific data from Firestore
  useEffect(() => {
    if (!selectedBusiness) return;

    const unReviews = subscribeReviews(selectedBusiness.id, setReviews);
    const unFeedback = subscribeFeedback(selectedBusiness.id, setFeedbackList);
    const unCustomers = subscribeCustomers(selectedBusiness.id, setCustomers);
    const unCases = subscribeRecoveryCases(selectedBusiness.id, setRecoveryCases);
    const unInteractions = subscribeInteractions(selectedBusiness.id, setInteractions);

    return () => {
      unReviews();
      unFeedback();
      unCustomers();
      unCases();
      unInteractions();
    };
  }, [selectedBusiness?.id]);

  // Subscribe to Global Data for Super Admin
  useEffect(() => {
    const unAllReviews = subscribeReviews(null, setAllReviews);
    const unAllCustomers = subscribeCustomers(null, setAllCustomers);
    const unAllCases = subscribeRecoveryCases(null, setAllRecoveryCases);

    async function loadPlansAndSettings() {
      try {
        const [p, s] = await Promise.all([getPlans(), getPlatformSettings()]);
        setPlans(p);
        setSettings(s);
      } catch (err) {
        console.error('Error loading global plans and settings:', err);
      }
    }
    loadPlansAndSettings();

    return () => {
      unAllReviews();
      unAllCustomers();
      unAllCases();
    };
  }, []);

  // Safety guard: if not super admin, forbid activeTab from being super_admin
  useEffect(() => {
    if (activeTab === 'super_admin' && !isSuperAdmin) {
      setActiveTab('dashboard');
    }
  }, [activeTab, isSuperAdmin]);

  // Pending cases for badge
  const pendingCasesCount = recoveryCases.filter(
    (c) => c.status === 'novo' || c.status === 'em_contacto'
  ).length;

  // Handle impersonating a business from Super Admin
  const handleImpersonateBusiness = (biz: Business) => {
    setSelectedBusiness(biz);
    setActiveTab('dashboard');
  };

  // If in public review view (e.g., client scanned QR code or user clicked preview)
  if (isCustomerViewMode) {
    return (
      <PublicReviewPage
        slug={reviewSlugFromUrl || selectedBusiness?.slug || 'mrnavalha'}
        businessOverride={!reviewSlugFromUrl ? selectedBusiness : null}
        onBackToApp={() => {
          setIsCustomerViewMode(false);
          // remove query param if exists without reload
          if (window.history.pushState) {
            const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.pushState({ path: newurl }, '', newurl);
          }
        }}
      />
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold text-slate-500">A inicializar o ReputaFlow...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex bg-slate-50/80">
      {/* Desktop Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'super_admin' && !isSuperAdmin) return;
          setActiveTab(tab);
        }}
        pendingCasesCount={pendingCasesCount}
        onOpenQrModal={() => setShowQrModal(true)}
        onOpenReviewPreview={() => setIsCustomerViewMode(true)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-8">
        {/* Top Header */}
        <Header
          onOpenQrModal={() => setShowQrModal(true)}
          onOpenReviewPreview={() => setIsCustomerViewMode(true)}
          onNavigateToSuperAdmin={() => {
            if (isSuperAdmin) setActiveTab('super_admin');
          }}
        />

        {/* Impersonation Banner ONLY visible if Super Admin is inspecting a merchant */}
        {isSuperAdmin && activeTab !== 'super_admin' && (
          <div className="bg-indigo-50/80 border-b border-indigo-100 px-4 sm:px-6 py-2 flex items-center justify-between text-xs text-indigo-900">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>
                Espaço: <strong>{selectedBusiness?.name || 'A carregar...'}</strong>
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600">Ambiente de teste do estabelecimento</span>
            </div>

            <button
              onClick={() => setActiveTab('super_admin')}
              className="text-indigo-700 hover:text-indigo-900 font-bold flex items-center gap-1 hover:underline"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Painel Super Admin</span>
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <main className="p-4 sm:p-6 max-w-7xl w-full mx-auto flex-1">
          {activeTab === 'dashboard' && (
            selectedBusiness ? (
              <MerchantDashboard
                business={selectedBusiness}
                reviews={reviews}
                customers={customers}
                recoveryCases={recoveryCases}
                feedbackList={feedbackList}
                onNavigate={(tab) => setActiveTab(tab)}
                onOpenQrModal={() => setShowQrModal(true)}
                onOpenReviewPreview={() => setIsCustomerViewMode(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-slate-200">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h3 className="text-base font-bold text-slate-800">A carregar o seu comércio...</h3>
                <p className="text-xs text-slate-500 mt-1">A sincronizar dados em tempo real.</p>
              </div>
            )
          )}

          {activeTab === 'crm' && selectedBusiness && (
            <MerchantCRM
              business={selectedBusiness}
              customers={customers}
              reviews={reviews}
              feedbackList={feedbackList}
              recoveryCases={recoveryCases}
              interactions={interactions}
            />
          )}

          {activeTab === 'recovery' && selectedBusiness && (
            <MerchantRecovery
              business={selectedBusiness}
              recoveryCases={recoveryCases}
            />
          )}

          {activeTab === 'reviews' && selectedBusiness && (
            <MerchantReviews
              business={selectedBusiness}
              reviews={reviews}
              feedbackList={feedbackList}
            />
          )}

          {activeTab === 'settings' && selectedBusiness && (
            <MerchantSettings
              business={selectedBusiness}
              onBusinessUpdated={(updated) => setSelectedBusiness(updated)}
              onOpenReviewPreview={() => setIsCustomerViewMode(true)}
            />
          )}

          {activeTab === 'super_admin' && isSuperAdmin && (
            <SuperAdminDashboard
              businesses={businesses}
              allReviews={allReviews}
              allCustomers={allCustomers}
              allRecoveryCases={allRecoveryCases}
              plans={plans}
              settings={settings}
              onImpersonateBusiness={handleImpersonateBusiness}
            />
          )}
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation (Section 9) */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        pendingCasesCount={pendingCasesCount}
      />

      {/* QR Code Modal */}
      {showQrModal && (
        <QrCodeModal
          business={selectedBusiness}
          onClose={() => setShowQrModal(false)}
          onOpenReviewPreview={() => {
            setShowQrModal(false);
            setIsCustomerViewMode(true);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
