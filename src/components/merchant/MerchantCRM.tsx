import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Search,
  Filter,
  Star,
  Phone,
  Mail,
  Calendar,
  MessageCircle,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  X,
  ExternalLink,
  ChevronRight,
  Send
} from 'lucide-react';
import { Customer, Review, Feedback, RecoveryCase, Interaction, Business } from '../../types';
import { updateCustomer, addInteraction } from '../../lib/dbService';

interface MerchantCRMProps {
  business: Business;
  customers: Customer[];
  reviews: Review[];
  feedbackList: Feedback[];
  recoveryCases: RecoveryCase[];
  interactions: Interaction[];
}

export const MerchantCRM: React.FC<MerchantCRMProps> = ({
  business,
  customers,
  reviews,
  feedbackList,
  recoveryCases,
  interactions
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // New interaction form state
  const [interactionType, setInteractionType] = useState<Interaction['type']>('whatsapp');
  const [interactionSummary, setInteractionSummary] = useState('');
  const [interactionOutcome, setInteractionOutcome] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);

  // Edit notes state
  const [editingNotes, setEditingNotes] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');

  // Filter options as per Section 5
  const filterOptions = [
    { id: 'all', label: 'Todas' },
    { id: '5_stars', label: '5 estrelas' },
    { id: '4_stars', label: '4 estrelas' },
    { id: '3_stars', label: '3 estrelas' },
    { id: '2_stars', label: '2 estrelas' },
    { id: '1_star', label: '1 estrela' },
    { id: 'pending', label: 'Pendentes' },
    { id: 'in_recovery', label: 'Em recuperação' },
    { id: 'resolved', label: 'Resolvidos' }
  ];

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Search
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      // Filter
      if (activeFilter === 'all') return true;
      if (activeFilter === '5_stars') return Math.round(c.avgRating) === 5;
      if (activeFilter === '4_stars') return Math.round(c.avgRating) === 4;
      if (activeFilter === '3_stars') return Math.round(c.avgRating) === 3;
      if (activeFilter === '2_stars') return Math.round(c.avgRating) === 2;
      if (activeFilter === '1_star') return Math.round(c.avgRating) === 1;
      if (activeFilter === 'pending') {
        const hasPending = recoveryCases.some(
          (rc) => rc.customerId === c.id && (rc.status === 'novo' || rc.status === 'em_contacto')
        );
        return hasPending || c.status === 'in_recovery';
      }
      if (activeFilter === 'in_recovery') return c.status === 'in_recovery';
      if (activeFilter === 'resolved') {
        return c.status === 'recovered' || c.status === 'active';
      }
      return true;
    });
  }, [customers, searchQuery, activeFilter, recoveryCases]);

  const handleOpenCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerNotes(customer.internalNotes || '');
    setEditingNotes(false);
  };

  const handleSaveNotes = async () => {
    if (!selectedCustomer) return;
    try {
      await updateCustomer(selectedCustomer.id, { internalNotes: customerNotes });
      setSelectedCustomer({ ...selectedCustomer, internalNotes: customerNotes });
      setEditingNotes(false);
    } catch (err) {
      console.error('Error saving customer notes:', err);
    }
  };

  const handleUpdateStatus = async (status: Customer['status']) => {
    if (!selectedCustomer) return;
    try {
      await updateCustomer(selectedCustomer.id, { status });
      setSelectedCustomer({ ...selectedCustomer, status });
    } catch (err) {
      console.error('Error updating customer status:', err);
    }
  };

  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !interactionSummary.trim()) return;

    setSavingInteraction(true);
    try {
      await addInteraction({
        businessId: business.id,
        customerId: selectedCustomer.id,
        type: interactionType,
        summary: interactionSummary,
        outcome: interactionOutcome || undefined,
        staffEmail: 'gerente@reputaflow.com',
        staffName: 'Gerente ReputaFlow'
      });
      setInteractionSummary('');
      setInteractionOutcome('');
    } catch (err) {
      console.error('Error saving interaction:', err);
    } finally {
      setSavingInteraction(false);
    }
  };

  // Get customer specific data for drawer
  const customerReviews = useMemo(() => {
    if (!selectedCustomer) return [];
    return reviews.filter((r) => r.customerId === selectedCustomer.id || r.customerPhone === selectedCustomer.phone);
  }, [selectedCustomer, reviews]);

  const customerFeedbacks = useMemo(() => {
    if (!selectedCustomer) return [];
    return feedbackList.filter((f) => f.customerId === selectedCustomer.id || f.customerPhone === selectedCustomer.phone);
  }, [selectedCustomer, feedbackList]);

  const customerInteractions = useMemo(() => {
    if (!selectedCustomer) return [];
    return interactions.filter((i) => i.customerId === selectedCustomer.id);
  }, [selectedCustomer, interactions]);

  const customerRecoveryCase = useMemo(() => {
    if (!selectedCustomer) return null;
    return recoveryCases.find((rc) => rc.customerId === selectedCustomer.id || rc.customerPhone === selectedCustomer.phone);
  }, [selectedCustomer, recoveryCases]);

  // Clean phone number for WhatsApp Web link
  const getWhatsAppLink = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const cleanNumber = digits.length <= 11 ? `55${digits}` : digits;
    return `https://wa.me/${cleanNumber}`;
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      return new Date(isoStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>CRM de Clientes</span>
          </h1>
          <p className="text-xs text-slate-500">
            Base completa de contactos, histórico de avaliações e acompanhamento de relacionamento
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition"
          />
        </div>
      </div>

      {/* Filters Pills (Section 5) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <div className="text-slate-400 text-xs flex items-center gap-1 mr-1 shrink-0">
          <Filter className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-500">Filtros:</span>
        </div>
        {filterOptions.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`py-1.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeFilter === f.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Customers Table / Grid */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Nenhum cliente encontrado</p>
            <p className="text-xs text-slate-400 mt-1">
              Ajuste os filtros ou aguarde a primeira avaliação de clientes através do QR Code.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 border-b border-slate-100 uppercase tracking-wider text-[10px] text-slate-500 font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Contacto</th>
                  <th className="py-3.5 px-4">Média / Avaliações</th>
                  <th className="py-3.5 px-4">Última Avaliação</th>
                  <th className="py-3.5 px-4">Última Interação</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => {
                  const statusBadge =
                    cust.status === 'in_recovery'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : cust.status === 'recovered'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : cust.status === 'churned'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200';

                  const statusLabel =
                    cust.status === 'in_recovery'
                      ? 'Em Recuperação'
                      : cust.status === 'recovered'
                      ? 'Recuperado'
                      : cust.status === 'churned'
                      ? 'Inativo'
                      : 'Ativo';

                  return (
                    <tr
                      key={cust.id}
                      onClick={() => handleOpenCustomer(cust)}
                      className="hover:bg-slate-50/80 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                            {cust.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span>{cust.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-800 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{cust.phone}</span>
                          </div>
                          {cust.email && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{cust.email}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{cust.avgRating}★</span>
                          <span className="text-[11px] font-normal text-slate-400">
                            ({cust.reviewsCount} {cust.reviewsCount === 1 ? 'avaliação' : 'avaliações'})
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {formatDate(cust.lastReviewAt)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {formatDate(cust.lastInteractionAt)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${statusBadge}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCustomer(cust);
                          }}
                          className="py-1 px-2.5 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition inline-flex items-center gap-1"
                        >
                          <span>Detalhes</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Full Details Drawer Modal */}
      <AnimatePresence>
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto"
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      {selectedCustomer.name}
                    </h2>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                      {selectedCustomer.avgRating}★
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {selectedCustomer.phone}
                    </span>
                    {selectedCustomer.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {selectedCustomer.email}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="p-6 space-y-6 flex-1">
                {/* Quick Actions (WhatsApp & Status) */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-indigo-50/70 rounded-2xl border border-indigo-100">
                  <a
                    href={getWhatsAppLink(selectedCustomer.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Conversar no WhatsApp</span>
                  </a>

                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-slate-500 font-medium">Estado:</span>
                    <select
                      value={selectedCustomer.status}
                      onChange={(e) => handleUpdateStatus(e.target.value as Customer['status'])}
                      className="bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="active">Ativo</option>
                      <option value="in_recovery">Em Recuperação</option>
                      <option value="recovered">Cliente Recuperado</option>
                      <option value="churned">Inativo / Churned</option>
                    </select>
                  </div>
                </div>

                {/* Internal Notes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Observações Internas</span>
                    </label>
                    {!editingNotes ? (
                      <button
                        onClick={() => setEditingNotes(true)}
                        className="text-[11px] text-indigo-600 hover:underline font-semibold"
                      >
                        Editar Notas
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveNotes}
                          className="text-[11px] text-emerald-600 font-bold"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditingNotes(false)}
                          className="text-[11px] text-slate-400"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {editingNotes ? (
                    <textarea
                      rows={3}
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="Adicione preferências do cliente, acordos feitos ou alertas..."
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 italic">
                      {selectedCustomer.internalNotes || 'Nenhuma observação interna cadastrada ainda.'}
                    </div>
                  )}
                </div>

                {/* Recovery Case Highlight (if exists) */}
                {customerRecoveryCase && (
                  <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Caso de Recuperação ({customerRecoveryCase.rating}★)
                      </span>
                      <span className="capitalize px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold text-[10px]">
                        {customerRecoveryCase.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-amber-800 text-[11px] leading-relaxed whitespace-pre-line">
                      {customerRecoveryCase.notes}
                    </p>
                  </div>
                )}

                {/* Feedbacks History */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Histórico de Feedbacks ({customerFeedbacks.length})
                  </h3>
                  {customerFeedbacks.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhum feedback detalhado de 1-4 estrelas.</p>
                  ) : (
                    <div className="space-y-2">
                      {customerFeedbacks.map((f) => (
                        <div key={f.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                          <div className="flex justify-between items-center text-[10px] text-slate-400">
                            <span>{formatDate(f.createdAt)}</span>
                            <span className="font-bold text-rose-600">{f.rating}★</span>
                          </div>
                          <p className="font-semibold text-slate-800">"{f.question1}"</p>
                          {f.question2 && (
                            <p className="text-slate-500 text-[11px]">Melhoria: {f.question2}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Interactions History & Logger */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Histórico de Contactos ({customerInteractions.length})
                  </h3>

                  {/* Add Interaction Form */}
                  <form onSubmit={handleAddInteraction} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Registar Novo Contacto</span>
                      <select
                        value={interactionType}
                        onChange={(e) => setInteractionType(e.target.value as Interaction['type'])}
                        className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-0.5 font-medium"
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="call">Chamada Telefónica</option>
                        <option value="email">E-mail</option>
                        <option value="note">Anotação Interna</option>
                      </select>
                    </div>

                    <input
                      type="text"
                      required
                      placeholder="Resumo do contacto (ex: Ligámos e oferecemos cortesia)..."
                      value={interactionSummary}
                      onChange={(e) => setInteractionSummary(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                    />

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Resultado / Resposta do cliente (opcional)..."
                        value={interactionOutcome}
                        onChange={(e) => setInteractionOutcome(e.target.value)}
                        className="flex-1 text-xs p-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={savingInteraction}
                        className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0"
                      >
                        <Send className="w-3 h-3" />
                        <span>Registar</span>
                      </button>
                    </div>
                  </form>

                  {/* Interactions List */}
                  <div className="space-y-2 pt-1">
                    {customerInteractions.map((item) => (
                      <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="capitalize font-bold text-indigo-700">{item.type}</span>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                        <p className="text-slate-800 font-medium">{item.summary}</p>
                        {item.outcome && (
                          <p className="text-emerald-700 font-semibold text-[11px]">
                            Resultado: {item.outcome}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="py-2 px-4 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
