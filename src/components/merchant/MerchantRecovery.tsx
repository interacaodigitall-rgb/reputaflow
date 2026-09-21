import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  MessageCircle,
  Star,
  ChevronRight,
  Filter,
  UserCheck,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { RecoveryCase, RecoveryCaseStatus, Business } from '../../types';
import { updateRecoveryCaseStatus } from '../../lib/dbService';

interface MerchantRecoveryProps {
  business: Business;
  recoveryCases: RecoveryCase[];
}

export const MerchantRecovery: React.FC<MerchantRecoveryProps> = ({
  business,
  recoveryCases
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const statuses: { id: RecoveryCaseStatus | 'all'; label: string; color: string }[] = [
    { id: 'all', label: 'Todos os Casos', color: 'bg-slate-100 text-slate-800' },
    { id: 'novo', label: 'Novo', color: 'bg-rose-100 text-rose-800 border-rose-200' },
    { id: 'em_contacto', label: 'Em contacto', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    { id: 'em_resolucao', label: 'Em resolução', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { id: 'resolvido', label: 'Resolvido', color: 'bg-teal-100 text-teal-800 border-teal-200' },
    { id: 'cliente_recuperado', label: 'Cliente recuperado', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  ];

  const filteredCases = recoveryCases.filter((c) => {
    if (selectedStatus === 'all') return true;
    return c.status === selectedStatus;
  });

  const handleStatusChange = async (caseId: string, newStatus: RecoveryCaseStatus, customerId?: string) => {
    setUpdatingId(caseId);
    try {
      await updateRecoveryCaseStatus(caseId, newStatus, undefined, customerId);
    } catch (err) {
      console.error('Error updating case status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const getWhatsAppLink = (phone: string, customerName: string) => {
    const digits = phone.replace(/\D/g, '');
    const cleanNumber = digits.length <= 11 ? `55${digits}` : digits;
    const msg = encodeURIComponent(
      `Olá ${customerName}, tudo bem? Aqui é da gerência do ${business.name}. Recebemos o seu feedback e gostaríamos muito de entender como podemos resolver a situação e lhe proporcionar uma excelente experiência.`
    );
    return `https://wa.me/${cleanNumber}?text=${msg}`;
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>Casos de Recuperação de Clientes</span>
          </h1>
          <p className="text-xs text-slate-500">
            Tickets criados automaticamente para avaliações de 1 a 4 estrelas. Contacte o cliente e reverta o descontentamento.
          </p>
        </div>

        {/* Quick summary pill */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-xs text-xs">
          <span className="font-semibold text-slate-600">Total:</span>
          <span className="font-bold text-slate-900">{recoveryCases.length} casos</span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-600 font-bold">
            {recoveryCases.filter((c) => c.status === 'cliente_recuperado').length} recuperados
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {statuses.map((s) => {
          const count =
            s.id === 'all'
              ? recoveryCases.length
              : recoveryCases.filter((c) => c.status === s.id).length;

          return (
            <button
              key={s.id}
              onClick={() => setSelectedStatus(s.id)}
              className={`py-1.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                selectedStatus === s.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{s.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  selectedStatus === s.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cases List */}
      <div className="space-y-4">
        {filteredCases.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/80 shadow-xs">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">Nenhum caso com este estado</h3>
            <p className="text-xs text-slate-400 mt-1">
              Excelente! Todos os incidentes foram devidamente tratados ou não há registros com o filtro selecionado.
            </p>
          </div>
        ) : (
          filteredCases.map((c) => (
            <div
              key={c.id}
              className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black text-sm border border-rose-100">
                    {c.rating}★
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{c.customerName}</span>
                      <span className="text-xs font-normal text-slate-400">
                        • {c.customerPhone}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Criado em {formatDate(c.createdAt)}
                      {c.resolvedAt && ` • Resolvido em ${formatDate(c.resolvedAt)}`}
                    </p>
                  </div>
                </div>

                {/* Status selector directly on card */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Estado do Ticket:</span>
                  <select
                    disabled={updatingId === c.id}
                    value={c.status}
                    onChange={(e) =>
                      handleStatusChange(c.id, e.target.value as RecoveryCaseStatus, c.customerId)
                    }
                    className="text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="novo">Novo</option>
                    <option value="em_contacto">Em contacto</option>
                    <option value="em_resolucao">Em resolução</option>
                    <option value="resolvido">Resolvido</option>
                    <option value="cliente_recuperado">Cliente recuperado</option>
                  </select>
                </div>
              </div>

              {/* Questions / Notes content */}
              <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100 text-xs text-slate-700 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Relato do Cliente
                </span>
                <p className="whitespace-pre-line leading-relaxed text-slate-800">
                  {c.notes || 'Sem anotações detalhadas.'}
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <a
                    href={getWhatsAppLink(c.customerPhone, c.customerName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Contactar via WhatsApp</span>
                  </a>

                  <a
                    href={`tel:${c.customerPhone}`}
                    className="inline-flex items-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-xs transition"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Ligar</span>
                  </a>
                </div>

                {c.status !== 'cliente_recuperado' && (
                  <button
                    onClick={() => handleStatusChange(c.id, 'cliente_recuperado', c.customerId)}
                    className="inline-flex items-center gap-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Marcar como Cliente Recuperado</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
