import React, { useState } from 'react';
import { Star, MessageSquare, ExternalLink, QrCode, Filter, Calendar, Phone, Mail, User } from 'lucide-react';
import { Review, Feedback, Business } from '../../types';

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

  const filteredReviews = reviews.filter((r) => {
    if (selectedRatingFilter === 'all') return true;
    return r.rating === selectedRatingFilter;
  });

  const getFeedbackForReview = (reviewId: string) => {
    return feedbackList.find((f) => f.reviewId === reviewId);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
            <span>Avaliações Recebidas</span>
          </h1>
          <p className="text-xs text-slate-500">
            Feedbacks de clientes recolhidos via QR Code e link oficial de avaliação
          </p>
        </div>

        {/* Rating Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedRatingFilter('all')}
            className={`py-1.5 px-3 rounded-xl text-xs font-semibold transition ${
              selectedRatingFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
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
                className={`py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
                  selectedRatingFilter === rating
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{rating}★</span>
                <span className="text-[10px] opacity-80">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reviews Cards List */}
      <div className="space-y-4">
        {filteredReviews.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/80 shadow-xs">
            <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">Nenhuma avaliação encontrada</h3>
            <p className="text-xs text-slate-400 mt-1">
              Partilhe o seu QR Code nas mesas e balcões para começar a receber opiniões.
            </p>
          </div>
        ) : (
          filteredReviews.map((rev) => {
            const feedback = getFeedbackForReview(rev.id);
            const isFiveStar = rev.rating === 5;

            return (
              <div
                key={rev.id}
                className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition space-y-3"
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

                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5" /> Canal: {rev.channel?.toUpperCase() || 'QR'}
                    </span>
                    <span>•</span>
                    <span>{formatDate(rev.createdAt)}</span>
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
    </div>
  );
};
