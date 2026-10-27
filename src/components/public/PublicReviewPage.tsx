import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star,
  CheckCircle2,
  Phone,
  User,
  Mail,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  HeartHandshake,
  Store,
  AlertCircle,
  MessageSquareHeart,
  Sparkles,
  Loader2
} from 'lucide-react';
import { Business } from '../../types';
import { getBusinessBySlug, submitReview, submitFeedbackAndRecovery, getLocalBusinesses } from '../../lib/dbService';
import { BusinessLogo } from '../common/BusinessLogo';

interface PublicReviewPageProps {
  slug?: string;
  businessOverride?: Business | null;
  onBackToApp?: () => void;
}

export const PublicReviewPage: React.FC<PublicReviewPageProps> = ({
  slug = '',
  businessOverride,
  onBackToApp
}) => {
  // Synchronous initial probe
  const initialLocalMatch =
    businessOverride ||
    (slug ? getLocalBusinesses().find((b: Business) => b.slug === slug || b.id === slug) : null) ||
    null;

  const [business, setBusiness] = useState<Business | null>(initialLocalMatch);
  const [loading, setLoading] = useState(!initialLocalMatch);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [selectedRating, setSelectedRating] = useState<number>(0);

  // Recovery form state (for 1-3 stars)
  const [question1, setQuestion1] = useState('');
  const [question2, setQuestion2] = useState('');
  const [wantsContact, setWantsContact] = useState<boolean>(true);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchBusiness = async () => {
    if (businessOverride) {
      setBusiness(businessOverride);
      setLoading(false);
      return;
    }

    if (!slug || !slug.trim()) {
      // If no slug provided, check if there is at least one local business available
      const local = getLocalBusinesses();
      if (local.length > 0) {
        setBusiness(local[0]);
      } else {
        setLoadError('Nenhum estabelecimento especificado no link (?b=slug).');
      }
      setLoading(false);
      return;
    }

    if (!business) {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const found = await getBusinessBySlug(slug);
      if (found) {
        setBusiness(found);
      } else if (!business) {
        setLoadError(`Estabelecimento não encontrado para o link informado ("${slug}").`);
      }
    } catch (err: any) {
      console.warn('Error loading business for review:', err);
      if (!business) {
        setLoadError('Não foi possível carregar os dados do estabelecimento.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusiness();

    const handleUpdate = () => {
      if (slug) {
        getBusinessBySlug(slug).then((b) => {
          if (b) setBusiness(b);
        });
      }
    };

    window.addEventListener('reputaflow_businesses_updated', handleUpdate);
    const interval = setInterval(handleUpdate, 5000);

    return () => {
      window.removeEventListener('reputaflow_businesses_updated', handleUpdate);
      clearInterval(interval);
    };
  }, [slug, businessOverride]);

  const handleSelectStar = (rating: number) => {
    setSelectedRating(rating);
    setFormError(null);
  };

  const handleConfirmRating = async () => {
    if (!business || selectedRating < 1) return;

    const minRating = Number(business.minRatingForGoogle || 4);

    // Regra: se atingir o limiar (ex: 4 e 5 estrelas), vai para o Google Reviews
    if (selectedRating >= minRating) {
      setSubmitting(true);

      let targetUrl = business.googleReviewUrl ? business.googleReviewUrl.trim() : '';
      if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      // Regista a avaliação positiva no banco de dados
      try {
        await submitReview({
          businessId: business.id,
          rating: selectedRating,
          channel: 'qr',
          source: 'google'
        });
      } catch (err) {
        console.warn('Review submission error:', err);
      } finally {
        setSubmitting(false);
        setIsCompleted(true);
      }

      if (targetUrl) {
        setTimeout(() => {
          try {
            window.location.href = targetUrl;
          } catch {
            try {
              window.open(targetUrl, '_blank');
            } catch (err2) {
              console.error('Redirection blocked by browser:', err2);
            }
          }
        }, 1200);
      }
    } else {
      // Classificação <= 3 estrelas desvia obrigatoriamente para o fluxo de recuperação privada
      setIsRecoveryOpen(true);
    }
  };

  const processNegativeFeedback = async (isAnonymous: boolean = false) => {
    if (!business || selectedRating < 1) return;

    const finalName = isAnonymous
      ? 'Cliente Anónimo'
      : (customerName.trim() || 'Cliente (QR Code)');
    const finalPhone = isAnonymous ? '' : customerPhone.trim();
    const finalEmail = isAnonymous ? '' : customerEmail.trim();

    setSubmitting(true);
    setFormError(null);

    try {
      // 1. Grava a avaliação na tabela de reviews com status adequado de feedback interno
      const rev = await submitReview({
        businessId: business.id,
        customerName: finalName,
        customerPhone: finalPhone,
        customerEmail: finalEmail,
        rating: selectedRating,
        channel: 'qr',
        source: 'recovery',
        isInternalFeedback: true
      });

      // 2. Dispara obrigatoriamente o registo na tabela de Casos de Recuperação (recovery_cases)
      const complaintComment = [
        question1 ? `Motivo: ${question1.trim()}` : '',
        question2 ? `Detalhes: ${question2.trim()}` : ''
      ].filter(Boolean).join(' | ') || `Avaliação negativa (${selectedRating} estrelas) submetida via QR Code.`;

      await submitFeedbackAndRecovery({
        businessId: business.id,
        reviewId: rev.reviewId,
        customerName: finalName,
        customerPhone: finalPhone,
        customerEmail: finalEmail,
        rating: selectedRating,
        question1: question1.trim() || 'Experiência insatisfatória',
        question2: complaintComment,
        question3WantsContact: isAnonymous ? false : wantsContact
      });

      setIsCompleted(true);
    } catch (err: any) {
      console.warn('Feedback submit error:', err);
      setIsCompleted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processNegativeFeedback(false);
  };

  const ratingDescriptions: Record<number, string> = {
    1: 'Experiência Muito Insatisfatória',
    2: 'Experiência Abaixo do Esperado',
    3: 'Experiência Regular / Neutra',
    4: 'Boa Experiência!',
    5: 'Excelente Experiência!'
  };

  // Skeleton loading state
  if (loading && !business) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100/70 via-white to-slate-50 flex flex-col justify-center items-center py-8 px-4 sm:px-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8 space-y-6 animate-pulse">
          <div className="w-20 h-20 bg-slate-200 rounded-2xl mx-auto"></div>
          <div className="h-6 bg-slate-200 rounded-xl w-3/4 mx-auto"></div>
          <div className="h-4 bg-slate-100 rounded-lg w-1/2 mx-auto"></div>
          <div className="pt-6 border-t border-slate-100 flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-10 h-10 bg-slate-200 rounded-full"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state if business not found
  if (loadError && !business) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100/70 via-white to-slate-50 flex flex-col justify-center items-center py-8 px-4 sm:px-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8 text-center space-y-5">
          <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-100">
            <Store className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">Estabelecimento não encontrado</h2>
            <p className="text-xs text-slate-500 leading-relaxed">{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col justify-between py-6 sm:py-10 px-4 sm:px-6 font-sans">
      {/* Top Header Badge */}
      <div className="max-w-md w-full mx-auto flex items-center justify-center">
        <div className="flex items-center gap-2 bg-white/80 backdrop-blur-xs px-3 py-1 rounded-full border border-slate-200/60 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Avaliação Oficial
          </span>
        </div>
      </div>

      {/* Main Review Card Container */}
      <div className="max-w-md w-full mx-auto my-auto">
        <AnimatePresence mode="wait">
          {!isCompleted ? (
            !isRecoveryOpen ? (
              /* Screen 1: Star Rating Selection */
              <motion.div
                key="rating-step"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-100/80 p-6 sm:p-8 space-y-6 text-center relative overflow-hidden"
              >
                {/* Business Info */}
                <div className="space-y-3">
                  <div className="flex justify-center">
                    <BusinessLogo
                      url={business.logoUrl}
                      name={business.name}
                      size="xl"
                      rounded="rounded-2xl"
                      className="shadow-md border border-slate-100"
                    />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {business.name}
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {business.category || 'Como foi a sua experiência connosco?'}
                    </p>
                  </div>
                </div>

                {/* Star Rating Buttons */}
                <div className="py-2">
                  <div className="flex justify-center items-center gap-2 sm:gap-3">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = (hoveredRating || selectedRating) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => handleSelectStar(star)}
                          onMouseEnter={() => setHoveredRating(star)}
                          onMouseLeave={() => setHoveredRating(0)}
                          className="p-1 sm:p-1.5 focus:outline-none transition-transform active:scale-90 hover:scale-110"
                          aria-label={`${star} estrelas`}
                        >
                          <Star
                            className={`w-9 h-9 sm:w-11 sm:h-11 transition-colors ${
                              isFilled
                                ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                                : 'text-slate-200 hover:text-slate-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* Rating Verbal Description */}
                  <div className="h-6 mt-3 flex items-center justify-center">
                    {(hoveredRating || selectedRating) > 0 ? (
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full animate-fade-in">
                        {ratingDescriptions[hoveredRating || selectedRating]}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        Toque numa estrela para avaliar
                      </span>
                    )}
                  </div>
                </div>

                {/* Confirm / Continue Button */}
                <div>
                  <button
                    type="button"
                    disabled={selectedRating === 0 || submitting}
                    onClick={handleConfirmRating}
                    className="w-full py-3.5 px-6 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>A processar...</span>
                      </>
                    ) : (
                      <>
                        <span>Continuar Avaliação</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Screen 2: Negative Feedback Recovery Form (1-3 stars) */
              <motion.div
                key="recovery-step"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-100/80 p-6 sm:p-8 space-y-5 text-left"
              >
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                    <HeartHandshake className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      Queremos ouvir você
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      O seu feedback é confidencial e vai diretamente para a gerência.
                    </p>
                  </div>
                </div>

                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <form onSubmit={handleRecoverySubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      O que não correu como esperado?
                    </label>
                    <select
                      value={question1}
                      onChange={(e) => setQuestion1(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">Selecione o motivo principal...</option>
                      <option value="Atendimento da equipa">Atendimento da equipa</option>
                      <option value="Tempo de espera / Atraso">Tempo de espera / Atraso</option>
                      <option value="Qualidade do serviço ou produto">Qualidade do serviço ou produto</option>
                      <option value="Ambiente / Limpeza">Ambiente / Limpeza</option>
                      <option value="Preço / Cobrança indevida">Preço / Cobrança indevida</option>
                      <option value="Outro motivo">Outro motivo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Conte-nos mais detalhes (opcional)
                    </label>
                    <textarea
                      rows={3}
                      value={question2}
                      onChange={(e) => setQuestion2(e.target.value)}
                      placeholder="Explique o que aconteceu para que possamos corrigir..."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Seus Dados para Contacto da Gerência
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Seu Nome *"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="tel"
                          required
                          placeholder="WhatsApp / Telefone *"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <input
                        type="email"
                        placeholder="E-mail (opcional)"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="wants-contact"
                      checked={wantsContact}
                      onChange={(e) => setWantsContact(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="wants-contact" className="text-xs text-slate-600 cursor-pointer">
                      Aceito ser contactado pela gerência para solucionar o caso
                    </label>
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRecoveryOpen(false)}
                      className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition text-center"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => processNegativeFeedback(true)}
                      className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition text-center disabled:opacity-50"
                      title="Enviar sem registrar nome e telefone"
                    >
                      Enviar Anonimamente
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>A enviar...</span>
                        </>
                      ) : (
                        <span>Enviar Feedback Privado</span>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )
          ) : (
            /* Screen 3: Thank You Screen */
            <motion.div
              key="completed-step"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-100 p-8 text-center space-y-5"
            >
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-extrabold text-slate-900">
                  {selectedRating >= 4 ? 'Agradecemos a sua avaliação!' : 'Obrigado pelo seu feedback sincero!'}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                  {selectedRating >= 4
                    ? 'A sua opinião é fundamental para mantermos a excelência do nosso espaço.'
                    : 'A gerência do estabelecimento foi informada e analisará as suas observações com máxima prioridade.'}
                </p>
              </div>

              {selectedRating >= 4 && business.googleReviewUrl && (
                <div className="pt-2">
                  <a
                    href={
                      business.googleReviewUrl.startsWith('http')
                        ? business.googleReviewUrl
                        : `https://${business.googleReviewUrl}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs transition shadow-md shadow-indigo-200"
                  >
                    <span>Avaliar também no Google</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Branding */}
      <div className="max-w-md w-full mx-auto text-center pt-4">
        <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>Plataforma Segura ReputaFlow</span>
        </div>
      </div>
    </div>
  );
};
