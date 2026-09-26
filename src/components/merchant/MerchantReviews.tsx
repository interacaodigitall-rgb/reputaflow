import React, { useState } from 'react';
import {
  Star,
  MessageSquare,
  ExternalLink,
  QrCode,
  Phone,
  Mail,
  User,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { Review, Feedback, Business } from '../../types';
import { deleteReview, clearAllReviews } from '../../lib/dbService';

interface MerchantReviewsProps {
  business: Business;
  reviews: Review[];
  feedbackList: Feedback[];
}

export const MerchantReviews: React.FC<MerchantReviewsProps> = ({
  business,
  reviews,
  feedbackList
}) => {
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | 'all'>('all');
  const [reviewToDelete, setReviewToDelete] = useState<Review | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredReviews = reviews.filter((r) => {
    if (selectedRatingFilter === 'all') return true;
    return r.rating === selectedRatingFilter;
  });

  const getFeedbackForReview = (reviewId: string) => {
    return feedbackList.find((f) => f.reviewId === reviewId);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDeleteSingle = async () => {
    if (!reviewToDelete) return;
    setDeletingId(reviewToDelete.id);
    try {
      await deleteReview(reviewToDelete.id);
      showToast('Avaliação excluída com sucesso.');
    } catch (err) {
      console.error('Erro ao excluir avaliação:', err);
    } finally {
      setDeletingId(null);
      setReviewToDelete(null);
    }
  };

  const handleClearAll = async () => {
    setIsClearingAll(true);
    try {
      await clearAllReviews(business.id);
      showToast('Todas as avaliações foram limpas.');
    } catch (err) {
      console.error('Erro ao limpar avaliações:', err);
    } finally {
      setIsClearingAll(false);
      setShowClearAllModal(false);
    }
  };

  const formatDate = (isoStr: string) => {
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
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
            <span>Avaliações Recebidas</span>
          </h1>
          <p className="text-xs text-slate-500">
            Feedbacks de clientes recolhidos via QR Code e link oficial de avaliação
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Rating Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
            <button
              onClick={() => setSelectedRatingFilter('all')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedRatingFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todas ({reviews.length})
            </button>
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = reviews.filter((r) => r.rating === rating).length;
              return (
                <button
                  key={rating}
                  onClick={() => setSelectedRatingFilter(rating)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 whitespace-nowrap transition ${
                    selectedRatingFilter === rating
                      ? 'bg-indigo-600 text-white shadow-xs font-bold'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>{rating}★</span>
                  <span className="text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Clear All Reviews Button */}
          {reviews.length > 0 && (
            <button
              onClick={() => setShowClearAllModal(true)}
              className="py-2 px-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 font-bold rounded-xl text-xs transition flex items-center gap-1.5 shrink-0 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Limpar Avaliações</span>
            </button>
          )}
        </div>
      </div>

      {/* Reviews Cards List */}
      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">Nenhuma avaliação encontrada</h3>
            <p className="text-xs text-slate-400">
              Partilhe o seu QR Code nas mesas e balcões para começar a receber opiniões.
            </p>
          </div>
        ) : (
          filteredReviews.map((rev) => {
            const feedback = getFeedbackForReview(rev.id);
            const isFiveStar = rev.rating === 5;
            const isDeleting = deletingId === rev.id;

            return (
              <div
                key={rev.id}
                className={`bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition space-y-3 relative ${
                  isDeleting ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${
                            s <= rev.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {rev.rating}.0 / 5.0
                    </span>
                    <span
                      className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                        isFiveStar
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isFiveStar ? 'Promotor (Google)' : 'Feedback Interno 1–4★'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5" /> Canal: {rev.channel?.toUpperCase() || 'QR'}
                    </span>
                    <span>•</span>
                    <span>{formatDate(rev.createdAt)}</span>

                    {/* Individual Delete Action */}
                    <button
                      onClick={() => setReviewToDelete(rev)}
                      title="Excluir avaliação"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Customer Info if available */}
                {(rev.customerName || feedback?.customerName) && (
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1 font-bold text-slate-800">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rev.customerName || feedback?.customerName}</span>
                    </div>
                    {(rev.customerPhone || feedback?.customerPhone) && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{rev.customerPhone || feedback?.customerPhone}</span>
                      </div>
                    )}
                    {(rev.customerEmail || feedback?.customerEmail) && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{rev.customerEmail || feedback?.customerEmail}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 1-4 Stars Questions & Answers Breakdown */}
                {feedback && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                    <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-100">
                      <p className="font-bold text-amber-900 mb-1">1. O que aconteceu?</p>
                      <p className="text-slate-700 leading-relaxed italic">
                        "{feedback.question1}"
                      </p>
                    </div>

                    <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-100">
                      <p className="font-bold text-indigo-900 mb-1">2. O que poderíamos melhorar?</p>
                      <p className="text-slate-700 leading-relaxed italic">
                        {feedback.question2 ? `"${feedback.question2}"` : 'Não especificado.'}
                      </p>
                    </div>
                  </div>
                )}

                {isFiveStar && (
                  <div className="text-xs text-emerald-800 bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100 flex items-center justify-between">
                    <span>
                      Avaliação máxima! O cliente recebeu a sugestão respeitosa de avaliar também no Google.
                    </span>
                    {business.googleReviewUrl && (
                      <a
                        href={business.googleReviewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        <span>Página Google</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal: Delete Single Review */}
      {reviewToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900 text-base">Excluir Avaliação?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tem certeza de que deseja excluir esta avaliação ({reviewToDelete.rating}★)? Esta ação irá removê-la permanentemente.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setReviewToDelete(null)}
                disabled={Boolean(deletingId)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteSingle}
                disabled={Boolean(deletingId)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
              >
                {deletingId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <span>Confirmar Exclusão</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Clear All Reviews */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900 text-base">Limpar Todas as Avaliações?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Você está prestes a remover <strong>todas as {reviews.length} avaliações</strong> cadastradas no estabelecimento <span className="text-slate-800 font-bold">{business.name}</span> do Supabase/Banco de dados. Esta ação é irreversível.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowClearAllModal(false)}
                disabled={isClearingAll}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAll}
                disabled={isClearingAll}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
              >
                {isClearingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Limpando...</span>
                  </>
                ) : (
                  <span>Sim, Limpar Tudo</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
