import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Star,
  Users,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  PhoneCall,
  QrCode,
  Copy,
  ExternalLink,
  MessageSquare,
  ArrowUpRight,
  ShieldCheck,
  Building
} from 'lucide-react';
import { Business, Review, Customer, RecoveryCase, Feedback } from '../../types';

interface MerchantDashboardProps {
  business: Business;
  reviews: Review[];
  customers: Customer[];
  recoveryCases: RecoveryCase[];
  feedbackList: Feedback[];
  onNavigate: (tab: string) => void;
  onOpenQrModal: () => void;
  onOpenReviewPreview: () => void;
}

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({
  business,
  reviews,
  customers,
  recoveryCases,
  feedbackList,
  onNavigate,
  onOpenQrModal,
  onOpenReviewPreview
}) => {
  // Compute Dashboard Metrics (Section 6)
  const stats = useMemo(() => {
    const totalReviews = reviews.length;
    const avgRating =
      totalReviews > 0
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1))
        : 0;

    const lowRatingReviews = reviews.filter((r) => r.rating <= 4).length;
    const pendingCases = recoveryCases.filter(
      (c) => c.status === 'novo' || c.status === 'em_contacto' || c.status === 'em_resolucao'
    ).length;

    const resolvedCases = recoveryCases.filter(
      (c) => c.status === 'resolvido' || c.status === 'cliente_recuperado'
    ).length;

    const recoveryRate =
      recoveryCases.length > 0
        ? Math.round((resolvedCases / recoveryCases.length) * 100)
        : 100;

    const contactedClients = recoveryCases.filter(
      (c) => c.status !== 'novo'
    ).length;

    // Distribution by stars
    const starCounts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      if (starCounts[r.rating] !== undefined) {
        starCounts[r.rating]++;
      }
    });

    return {
      totalReviews,
      avgRating,
      lowRatingReviews,
      pendingCases,
      resolvedCases,
      recoveryRate,
      contactedClients,
      starCounts
    };
  }, [reviews, recoveryCases]);

  const publicReviewUrl = `${window.location.origin}?b=${business.slug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicReviewUrl);
    alert('Link de avaliação copiado para a área de transferência!');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Merchant Welcome & Share Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Star className="w-80 h-80 text-white" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur rounded-full text-xs font-medium text-indigo-200">
              <Building className="w-3.5 h-3.5" />
              <span>{business.category || 'Espaço Comercial'}</span>
              <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
              <span className="text-emerald-300">Ativo</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {business.name}
            </h1>
            <p className="text-slate-300 text-sm max-w-xl">
              Monitorize avaliações em tempo real, proteja a sua reputação pública e recupere clientes insatisfeitos antes que virem reclamações.
            </p>
          </div>

          {/* Quick Review Share Actions */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10 backdrop-blur">
            <button
              onClick={onOpenQrModal}
              className="flex items-center gap-2 py-2.5 px-4 bg-white text-slate-900 hover:bg-slate-100 font-semibold rounded-xl text-xs transition shadow-sm"
            >
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span>Gerar QR Code</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 py-2.5 px-4 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl text-xs transition"
            >
              <Copy className="w-4 h-4" />
              <span>Copiar Link</span>
            </button>
            <button
              onClick={onOpenReviewPreview}
              className="flex items-center gap-2 py-2.5 px-3 text-indigo-200 hover:text-white font-medium text-xs transition"
              title="Testar como cliente"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Testar Página</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid (7 cards as specified in Section 6) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
        {/* 1. Total Reviews */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Total Avaliações
            </span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.totalReviews}</div>
          <div className="text-[11px] text-slate-400 mt-1">Registadas na plataforma</div>
        </div>

        {/* 2. Average Stars */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Média de Estrelas
            </span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">{stats.avgRating}</span>
            <span className="text-xs text-slate-400 font-medium">/ 5.0</span>
          </div>
          <div className="text-[11px] text-amber-600 font-medium mt-1">Satisfação geral</div>
        </div>

        {/* 3. Avaliações 1-4 estrelas */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Avaliações 1–4★
            </span>
            <MessageSquare className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.lowRatingReviews}</div>
          <div className="text-[11px] text-slate-400 mt-1">Feedback privado</div>
        </div>

        {/* 4. Casos pendentes */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Casos Pendentes
            </span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{stats.pendingCases}</div>
          <div className="text-[11px] text-amber-600 font-medium mt-1">Aguardam atenção</div>
        </div>

        {/* 5. Casos resolvidos */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Casos Resolvidos
            </span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{stats.resolvedCases}</div>
          <div className="text-[11px] text-slate-400 mt-1">Concluídos com sucesso</div>
        </div>

        {/* 6. Taxa de recuperação */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Taxa Recuperação
            </span>
            <TrendingUp className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.recoveryRate}%</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">Eficácia da equipa</div>
        </div>

        {/* 7. Clientes contactados */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Contactados
            </span>
            <PhoneCall className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{stats.contactedClients}</div>
          <div className="text-[11px] text-slate-400 mt-1">Com follow-up ativo</div>
        </div>
      </div>

      {/* Main Insights & Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Star Rating Distribution (Clean professional bar chart) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Distribuição de Avaliações</h2>
              <p className="text-xs text-slate-500">Divisão quantitativa das notas recebidas pelos clientes</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">
              {stats.totalReviews} votos
            </span>
          </div>

          <div className="space-y-3.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = stats.starCounts[stars] || 0;
              const percentage = stats.totalReviews > 0 ? Math.round((count / stats.totalReviews) * 100) : 0;
              const barColor =
                stars === 5
                  ? 'bg-emerald-500'
                  : stars === 4
                  ? 'bg-blue-500'
                  : stars === 3
                  ? 'bg-amber-400'
                  : 'bg-rose-500';

              return (
                <div key={stars} className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1 w-12 text-slate-600 font-semibold">
                    <span>{stars}</span>
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>
                  <div className="w-20 text-right text-slate-500 font-medium">
                    <span className="font-bold text-slate-800">{count}</span> ({percentage}%)
                  </div>
                </div>
              );
            })}
          </div>

          {/* Strategic Insight */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>
                <strong>{stats.starCounts[5]} clientes 5 estrelas</strong> foram convidados para avaliação no Google.
              </span>
            </div>
            <button
              onClick={() => onNavigate('reviews')}
              className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
            >
              <span>Ver todas as avaliações</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Priority Action Card: Immediate Recovery Cases */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">Casos a Recuperar</h2>
              {stats.pendingCases > 0 && (
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold animate-pulse">
                  {stats.pendingCases} novos
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Clientes que avaliaram de 1 a 4 estrelas e aguardam resposta da gerência.
            </p>

            {recoveryCases.filter((c) => c.status === 'novo' || c.status === 'em_contacto').length === 0 ? (
              <div className="text-center py-8 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">Tudo sob controlo!</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Não há casos pendentes ou reclamações abertas no momento.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recoveryCases
                  .filter((c) => c.status === 'novo' || c.status === 'em_contacto')
                  .slice(0, 3)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/70 transition"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-800">{c.customerName}</span>
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-rose-500 text-rose-500" />
                          <span className="font-bold text-rose-600">{c.rating}★</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                        {c.notes?.replace('Q1: ', '') || 'Feedback recebido'}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/50">
                        <span className="text-slate-600 font-medium">{c.customerPhone}</span>
                        <span className="capitalize px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                          {c.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('recovery')}
            className="w-full mt-4 py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5"
          >
            <span>Gerir Todos os Casos no CRM</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
