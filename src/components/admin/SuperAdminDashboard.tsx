import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Building,
  Users,
  Star,
  AlertTriangle,
  CheckCircle,
  Plus,
  ExternalLink,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  Sliders,
  DollarSign,
  Search,
  Save,
  LogIn,
  QrCode,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';
import { Business, Customer, Review, RecoveryCase, Plan, PlatformSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  createBusiness,
  updateBusiness,
  deleteBusiness,
  savePlan,
  savePlatformSettings
} from '../../lib/dbService';
import { getPublicReviewUrl } from '../../lib/urlHelper';
import { QrCodeModal } from '../common/QrCodeModal';

interface SuperAdminDashboardProps {
  businesses: Business[];
  allReviews: Review[];
  allCustomers: Customer[];
  allRecoveryCases: RecoveryCase[];
  plans: Plan[];
  settings: PlatformSettings | null;
  onImpersonateBusiness: (business: Business) => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  businesses,
  allReviews,
  allCustomers,
  allRecoveryCases,
  plans,
  settings,
  onImpersonateBusiness
}) => {
  const { changePassword, currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'merchants' | 'plans' | 'settings'>('merchants');
  const [searchBiz, setSearchBiz] = useState('');
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [qrModalBiz, setQrModalBiz] = useState<Business | null>(null);
  const [copiedBizId, setCopiedBizId] = useState<string | null>(null);

  // Admin Change Password States
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [adminPasswordStatus, setAdminPasswordStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [adminPasswordError, setAdminPasswordError] = useState('');

  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassword.trim() || newAdminPassword.length < 6) {
      setAdminPasswordStatus('error');
      setAdminPasswordError('A senha deve conter pelo menos 6 caracteres.');
      return;
    }

    setAdminPasswordStatus('loading');
    try {
      await changePassword(newAdminPassword);
      setAdminPasswordStatus('success');
      setNewAdminPassword('');
      setTimeout(() => setAdminPasswordStatus('idle'), 4000);
    } catch (err: any) {
      console.error(err);
      setAdminPasswordStatus('error');
      setAdminPasswordError(err.message || 'Erro ao alterar a senha. Tente novamente.');
    }
  };

  // Create Business Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [newBizSlug, setNewBizSlug] = useState('');
  const [newBizCategory, setNewBizCategory] = useState('');
  const [newBizPhone, setNewBizPhone] = useState('');
  const [newBizEmail, setNewBizEmail] = useState('');
  const [newBizPassword, setNewBizPassword] = useState('');
  const [newBizAddress, setNewBizAddress] = useState('');
  const [newBizPlan, setNewBizPlan] = useState('plan_pro');
  const [newBizGoogleUrl, setNewBizGoogleUrl] = useState('');
  const [newBizLogoUrl, setNewBizLogoUrl] = useState('');
  const [newBizCurrency, setNewBizCurrency] = useState<'EUR' | 'BRL'>('EUR');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Business Deletion Modal State
  const [businessToDelete, setBusinessToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Settings State
  const [platformName, setPlatformName] = useState(settings?.platformName || 'ReputaFlow');
  const [supportEmail, setSupportEmail] = useState(settings?.supportEmail || 'suporte@reputaflow.com');
  const [defaultGoogleInstructions, setDefaultGoogleInstructions] = useState(
    settings?.defaultGoogleReviewInstructions ||
      'Agradecemos a sua avaliação sincera! O seu feedback ajuda outros clientes na comunidade.'
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Global Metrics (Section 7)
  const globalStats = useMemo(() => {
    const totalBusinesses = businesses.length;
    const activeBusinesses = businesses.filter((b) => b.status === 'active').length;
    const pendingBusinesses = businesses.filter((b) => b.status === 'pending').length;
    const suspendedBusinesses = businesses.filter((b) => b.status === 'suspended').length;
    const totalReviews = allReviews.length;
    const totalCustomers = allCustomers.length;
    const totalCases = allRecoveryCases.length;
    const resolvedCases = allRecoveryCases.filter(
      (c) => c.status === 'resolvido' || c.status === 'cliente_recuperado'
    ).length;
    const avgGlobalRating =
      totalReviews > 0
        ? Number((allReviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1))
        : 0;

    return {
      totalBusinesses,
      activeBusinesses,
      pendingBusinesses,
      suspendedBusinesses,
      totalReviews,
      totalCustomers,
      totalCases,
      resolvedCases,
      avgGlobalRating
    };
  }, [businesses, allReviews, allCustomers, allRecoveryCases]);

  const filteredBusinesses = useMemo(() => {
    return businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(searchBiz.toLowerCase()) ||
        b.email.toLowerCase().includes(searchBiz.toLowerCase()) ||
        b.slug.toLowerCase().includes(searchBiz.toLowerCase())
    );
  }, [businesses, searchBiz]);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizName.trim()) {
      setCreateError('Por favor, informe o nome do estabelecimento.');
      return;
    }
    if (!newBizEmail.trim()) {
      setCreateError('Por favor, informe o e-mail de login para o comerciante.');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const slugClean = (newBizSlug || newBizName)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');

      const businessData: Omit<Business, 'id'> = {
        name: newBizName.trim(),
        slug: slugClean,
        category: newBizCategory.trim() || 'Comércio & Serviços',
        phone: newBizPhone.trim(),
        email: newBizEmail.trim().toLowerCase(),
        address: newBizAddress.trim(),
        status: 'active',
        planId: newBizPlan,
        ownerId: currentUser?.uid || 'admin-created',
        currency: newBizCurrency,
        createdAt: new Date().toISOString(),
        password: newBizPassword.trim() || 'senha123'
      };

      if (newBizLogoUrl.trim()) {
        businessData.logoUrl = newBizLogoUrl.trim();
      }
      if (newBizGoogleUrl.trim()) {
        let cleanGoogleUrl = newBizGoogleUrl.trim();
        if (!/^https?:\/\//i.test(cleanGoogleUrl)) {
          cleanGoogleUrl = 'https://' + cleanGoogleUrl;
        }
        businessData.googleReviewUrl = cleanGoogleUrl;
      }

      const createdName = newBizName.trim();
      await createBusiness(businessData);

      setShowCreateModal(false);
      setNewBizName('');
      setNewBizSlug('');
      setNewBizCategory('');
      setNewBizPhone('');
      setNewBizEmail('');
      setNewBizPassword('');
      setNewBizAddress('');
      setNewBizGoogleUrl('');
      setNewBizLogoUrl('');
      setNewBizCurrency('EUR');
      setCreateError(null);
      setSuccessBanner(`Estabelecimento "${createdName}" cadastrado com sucesso!`);
      setTimeout(() => setSuccessBanner(null), 6000);
    } catch (err: any) {
      console.error('Error creating business:', err);
      setCreateError(
        err?.message?.includes('permission')
          ? 'Erro de permissão no Firestore. Verifique se está autenticado como administrador.'
          : 'Ocorreu um erro ao salvar o estabelecimento. Verifique os dados e tente novamente.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (biz: Business) => {
    const nextStatus = biz.status === 'active' ? 'suspended' : 'active';
    try {
      await updateBusiness(biz.id, { status: nextStatus });
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const confirmDeleteBusiness = async () => {
    if (!businessToDelete) return;
    setDeleting(true);
    try {
      await deleteBusiness(businessToDelete.id);
      setToastMessage(`Estabelecimento "${businessToDelete.name}" excluído com sucesso!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error('Error deleting business:', err);
      setToastMessage('Erro ao excluir estabelecimento.');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setDeleting(false);
      setBusinessToDelete(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await savePlatformSettings({
        id: 'global',
        platformName,
        supportEmail,
        defaultGoogleReviewInstructions: defaultGoogleInstructions,
        allowPublicRegistration: true
      });
      alert('Configurações globais salvas com sucesso!');
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Super Admin Top Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full text-xs font-bold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Painel Central Super Admin</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Gestão Global da Plataforma
            </h1>
            <p className="text-slate-400 text-xs max-w-xl">
              Supervisão de todos os estabelecimentos comerciais, planos contratados, parâmetros globais e acesso irrestrito aos CRMs.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-indigo-900/40 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Comerciante</span>
          </button>
        </div>
      </div>

      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Metrics Cards (Section 7) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Comerciantes */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Comerciantes
          </span>
          <div className="text-2xl font-black text-slate-900">{globalStats.totalBusinesses}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {globalStats.activeBusinesses} ativos • {globalStats.suspendedBusinesses} suspensos
          </div>
        </div>

        {/* Comerciantes Ativos */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Comerciantes Ativos
          </span>
          <div className="text-2xl font-black text-emerald-600">{globalStats.activeBusinesses}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Em operação</div>
        </div>

        {/* Total Avaliações */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Avaliações
          </span>
          <div className="text-2xl font-black text-slate-900">{globalStats.totalReviews}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Em todos os espaços</div>
        </div>

        {/* Média Global */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Média Global
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">{globalStats.avgGlobalRating}</span>
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Satisfação média</div>
        </div>

        {/* Total Clientes CRM */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total de Clientes
          </span>
          <div className="text-2xl font-black text-slate-900">{globalStats.totalCustomers}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Registados nos CRMs</div>
        </div>

        {/* Casos de Recuperação */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Casos Recuperação
          </span>
          <div className="text-2xl font-black text-amber-600">{globalStats.totalCases}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
            {globalStats.resolvedCases} resolvidos
          </div>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none max-w-full -mx-1 px-1">
        <button
          onClick={() => setActiveTab('merchants')}
          className={`py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap min-h-[40px] ${
            activeTab === 'merchants'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Comerciantes ({businesses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap min-h-[40px] ${
            activeTab === 'plans'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Planos SaaS ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`py-2 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap min-h-[40px] ${
            activeTab === 'settings'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Parâmetros Globais</span>
        </button>
      </div>

      {/* TAB 1: COMERCIANTES MANAGEMENT */}
      {activeTab === 'merchants' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar por nome, slug ou e-mail..."
                value={searchBiz}
                onChange={(e) => setSearchBiz(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-w-full">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 uppercase tracking-wider text-[10px] text-slate-400 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Estabelecimento</th>
                    <th className="py-3 px-4">Segmento</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-4">Plano</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBusinesses.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{b.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">?b={b.slug}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        {b.category || 'Não definido'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 font-medium">{b.phone}</div>
                        <div className="text-[11px] text-slate-400">{b.email}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="capitalize px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[11px]">
                          {b.planId?.replace('plan_', '') || 'Standard'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            b.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {b.status === 'active' ? 'Ativo' : 'Suspenso'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copiar Link de Avaliação */}
                          <button
                            onClick={() => {
                              const url = getPublicReviewUrl(b.slug || b.id);
                              navigator.clipboard.writeText(url);
                              setCopiedBizId(b.id);
                              setTimeout(() => setCopiedBizId(null), 2500);
                            }}
                            title="Copiar link de avaliação pública"
                            className={`p-1.5 rounded-lg text-xs transition flex items-center gap-1 ${
                              copiedBizId === b.id
                                ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'
                                : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                            }`}
                          >
                            {copiedBizId === b.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Ver QR Code */}
                          <button
                            onClick={() => setQrModalBiz(b)}
                            title="Ver e descarregar QR Code deste estabelecimento"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          {/* Abrir Link em Nova Aba */}
                          <a
                            href={getPublicReviewUrl(b.slug || b.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir página de avaliação em nova aba"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          {/* Aceder ao CRM (Section 1 requirement) */}
                          <button
                            onClick={() => onImpersonateBusiness(b)}
                            title="Aceder ao CRM deste estabelecimento"
                            className="py-1 px-2.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition flex items-center gap-1 ml-1"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>Aceder ao CRM</span>
                          </button>

                          {/* Suspender / Ativar */}
                          <button
                            onClick={() => handleToggleStatus(b)}
                            title={b.status === 'active' ? 'Suspender comerciante' : 'Ativar comerciante'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                          >
                            {b.status === 'active' ? (
                              <Lock className="w-4 h-4 text-amber-500" />
                            ) : (
                              <Unlock className="w-4 h-4 text-emerald-600" />
                            )}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setBusinessToDelete({ id: b.id, name: b.name })}
                            title="Excluir"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PLANS */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.id}
              className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                    Ativo
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-indigo-600 font-bold">
                    {p.currency === 'EUR' ? '€' : 'R$'}
                  </span>
                  <span className="text-3xl font-black text-slate-900">{p.price}</span>
                  <span className="text-xs text-slate-400">/mês</span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>• Limite de {p.maxBusinesses} estabelecimento(s)</div>
                  <div>• Até {p.maxReviewsMonth} avaliações/mês</div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Recursos:</span>
                  {p.features?.map((f, idx) => (
                    <div key={idx} className="text-xs text-slate-600 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => alert(`Plano ${p.name} configurado no sistema.`)}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                >
                  Editar Limites
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: PLATFORM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
                Parâmetros Globais do ReputaFlow
              </h2>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome da Plataforma
                </label>
                <input
                  type="text"
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  E-mail de Suporte Geral
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Texto Padrão de Sugestão do Google
                </label>
                <textarea
                  rows={3}
                  value={defaultGoogleInstructions}
                  onChange={(e) => setDefaultGoogleInstructions(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Instrução neutra exibida para clientes 5 estrelas quando o comerciante não definir customizada.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Parâmetros Globais</span>
                </button>
              </div>
            </form>
          </div>

          {/* Change Admin Password Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wider border-b border-slate-100 pb-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>Segurança: Alterar Senha do Administrador</span>
            </h2>
            <p className="text-xs text-slate-500">
              Como Administrador Geral, pode atualizar a sua senha de acesso ao painel aqui.
            </p>

            <form onSubmit={handleChangeAdminPassword} className="space-y-3">
              {adminPasswordStatus === 'success' && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Senha de Administrador alterada com sucesso!</span>
                </div>
              )}
              {adminPasswordStatus === 'error' && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />
                  <span>{adminPasswordError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  placeholder="Nova senha de administrador (mínimo 6 caracteres)"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={adminPasswordStatus === 'loading'}
                  className="py-2.5 px-5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition whitespace-nowrap"
                >
                  {adminPasswordStatus === 'loading' ? 'A atualizar...' : 'Alterar Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Criar Comerciante (Section 1 requirement) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-slate-900">Criar Novo Comerciante</h2>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBusiness} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome do Estabelecimento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Picanha na Brasa"
                  value={newBizName}
                  onChange={(e) => {
                    setNewBizName(e.target.value);
                    if (!newBizSlug) {
                      setNewBizSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                    }
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Slug da URL *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="picanha-brasa"
                    value={newBizSlug}
                    onChange={(e) => setNewBizSlug(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Plano Atribuído
                  </label>
                  <select
                    value={newBizPlan}
                    onChange={(e) => setNewBizPlan(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="plan_starter">Starter (R$ 99)</option>
                    <option value="plan_pro">Profissional (R$ 199)</option>
                    <option value="plan_enterprise">Enterprise (R$ 399)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    placeholder="(11) 99999-8888"
                    value={newBizPhone}
                    onChange={(e) => setNewBizPhone(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Segmento / Categoria
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Restaurante, Clínica"
                    value={newBizCategory}
                    onChange={(e) => setNewBizCategory(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* CRM Access Credentials Section */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2.5">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Credenciais de Acesso ao CRM
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      E-mail de Login *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="comercio@reputaflow.com"
                      value={newBizEmail}
                      onChange={(e) => setNewBizEmail(e.target.value)}
                      className="w-full text-xs p-2.5 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Senha Inicial *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={newBizPassword}
                      onChange={(e) => setNewBizPassword(e.target.value)}
                      className="w-full text-xs p-2.5 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Endereço Completo
                  </label>
                  <input
                    type="text"
                    placeholder="Rua, Número, Cidade"
                    value={newBizAddress}
                    onChange={(e) => setNewBizAddress(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Moeda Padrão
                  </label>
                  <select
                    value={newBizCurrency}
                    onChange={(e) => setNewBizCurrency(e.target.value as 'EUR' | 'BRL')}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="EUR">Euro (€)</option>
                    <option value="BRL">Real (R$)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  URL do Logótipo (Imagem)
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/logo.png"
                  value={newBizLogoUrl}
                  onChange={(e) => setNewBizLogoUrl(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Link Oficial do Google Review (opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://g.page/r/.../review"
                  value={newBizGoogleUrl}
                  onChange={(e) => setNewBizGoogleUrl(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2 px-4 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="py-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar Estabelecimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {businessToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Excluir Estabelecimento
            </h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              Tem certeza que deseja excluir o comércio{' '}
              <strong className="text-slate-900 font-semibold">"{businessToDelete.name}"</strong>?
              Esta ação removerá o comércio da plataforma.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setBusinessToDelete(null)}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeleteBusiness}
                className="py-2.5 px-5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm shadow-md transition disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Sim, Excluir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal for Selected Business */}
      {qrModalBiz && (
        <QrCodeModal
          business={qrModalBiz}
          onClose={() => setQrModalBiz(null)}
          onOpenReviewPreview={() => {
            window.open(getPublicReviewUrl(qrModalBiz.slug || qrModalBiz.id), '_blank');
            setQrModalBiz(null);
          }}
        />
      )}
    </div>
  );
};
