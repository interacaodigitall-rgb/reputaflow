import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, CheckCircle2, Phone, User, Mail, ArrowRight, ExternalLink, ShieldCheck, HeartHandshake, RefreshCw, Store, X } from 'lucide-react';
import { Business } from '../../types';
import { getBusinessBySlug, submitReview, submitFeedbackAndRecovery, getLocalBusinesses } from '../../lib/dbService';
import { REGISTERED_BUSINESSES } from '../../lib/initialData';

interface PublicReviewPageProps {
  slug?: string;
  businessOverride?: Business | null;
  onBackToApp?: () => void;
}

export const PublicReviewPage: React.FC<PublicReviewPageProps> = ({
  slug = 'mrnavalha',
  businessOverride,
  onBackToApp
}) => {
  // Synchronous initial probe to avoid blank screen/hanging on QR scan
  const initialLocalMatch = 
    businessOverride ||
    getLocalBusinesses().find((b) => b.slug === slug || b.id === slug) ||
    REGISTERED_BUSINESSES.find((b) => b.slug === slug || b.id === slug) ||
    null;

  const [business, setBusiness] = useState<Business | null>(initialLocalMatch);
  const [loading, setLoading] = useState(!initialLocalMatch);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [selectedRating, setSelectedRating] = useState<number>(0);

  // Recovery form state (for 1-4 stars)
  const [question1, setQuestion1] = useState('');
  const [question2, setQuestion2] = useState('');
  const [wantsContact, setWantsContact] = useState<boolean>(true);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  // Reset logo error whenever the active business changes
  useEffect(() => {
    setLogoError(false);
  }, [business?.id, business?.logoUrl]);

  const fetchBusiness = async () => {
    if (businessOverride) {
      setBusiness(businessOverride);
      setLoading(false);
      return;
    }
    
    // If not already resolved locally, show loading
    if (!business) {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const found = await getBusinessBySlug(slug);
      if (found) {
        setBusiness(found);
      } else if (!business) {
        setLoadError(`Não foi possível carregar os dados para o identificador "${slug}".`);
      }
    } catch (err: any) {
      console.warn('Error loading business for review:', err);
      if (!business) {
        setLoadError('Erro de conexão ao carregar os dados do estabelecimento.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusiness();

    const handleUpdate = () => {
      getBusinessBySlug(slug).then((b) => {
        if (b) setBusiness(b);
      });
    };

    window.addEventListener('reputaflow_businesses_updated', handleUpdate);
    const interval = setInterval(handleUpdate, 4000);

    return () => {
      window.removeEventListener('reputaflow_businesses_updated', handleUpdate);
      clearInterval(interval);
    };
  }, [slug, businessOverride]);

  const handleSelectStar = async (rating: number) => {
    setSelectedRating(rating);

    if (rating === 5 && business) {
      setSubmitting(true);
      setIsCompleted(true);

      // Determine target redirect URL from business registration
      let targetUrl = business.googleReviewUrl ? business.googleReviewUrl.trim() : '';
      if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
      }

      // Record review and AWAIT Firestore write before navigation!
      try {
        await submitReview({
          businessId: business.id,
          rating: 5,
          channel: 'qr'
        });
      } catch (err) {
        console.warn('Review submission error:', err);
      } finally {
        setSubmitting(false);
      }

      // If business has a registered review URL, redirect to Google Review after write is committed
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
        }, 350);
      }
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || selectedRating < 1 || selectedRating > 4) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      alert('Por favor, preencha pelo menos o seu nome e telefone.');
      return;
    }

    setSubmitting(true);
    try {
      const rev = await submitReview({
        businessId: business.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        rating: selectedRating,
        channel: 'qr'
      });

      await submitFeedbackAndRecovery({
        businessId: business.id,
        reviewId: rev.reviewId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        rating: selectedRating,
        question1: question1.trim(),
        question2: question2.trim(),
        question3WantsContact: wantsContact
      });

      // Complete immediately and show success screen
      setIsCompleted(true);
    } catch (err) {
      console.warn('Feedback submit handled gracefully:', err);
      setIsCompleted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const ratingDescriptions: Record<number, string> = {
    1: 'Experiência Muito Insatisfatória',
    2: 'Experiência Abaixo do Esperado',
    3: 'Experiência Regular / Neutra',
    4: 'Boa Experiência',
    5: 'Excelente Experiência!'
  };

  // Skeleton loading state for fast optical perception
  if (loading && !business) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100/70 via-white to-slate-50 flex flex-col justify-center items-center py-8 px-4 sm:px-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8 space-y-6 animate-pulse">
          <div className="w-20 h-20 bg-slate-200 rounded-2xl mx-auto"></div>
          <div className="h-6 bg-slate-200 rounded-xl w-3/4 mx-auto"></div>
          <div className="h-4 bg-slate-100 rounded-lg w-1/2 mx-auto"></div>
          <div className="pt-6 border-t border-slate-100 flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-10 h-10 bg-slate-100 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-md w-full space-y-5">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <Store className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Estabelecimento não encontrado</h2>
            <p className="text-slate-600 text-xs mt-1.5 leading-relaxed">
              O link de avaliação fornecido não foi localizado ou o estabelecimento ainda está a sincronizar.
            </p>
            {slug && (
              <div className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] text-slate-500 break-all">
                Identificador: ?b={slug}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => fetchBusiness()}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tentar carregar novamente</span>
            </button>

            {onBackToApp && (
              <button
                onClick={onBackToApp}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
              >
                Voltar à Plataforma
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/70 via-white to-slate-50 flex flex-col justify-between py-8 px-4 sm:px-6 relative">
      {/* Floating Close Button when previewing from admin/merchant app */}
      {onBackToApp && (
        <button
          onClick={onBackToApp}
          className="fixed top-4 right-4 z-50 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full shadow-lg transition"
          title="Fechar Pré-visualização"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="max-w-md w-full mx-auto my-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden"
        >
          {/* Business Header & Logo */}
          <div className="px-6 pt-8 pb-4 text-center">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-white shadow-md border-2 border-white ring-2 ring-slate-100 flex items-center justify-center overflow-hidden p-1">
              {business.logoUrl && !logoError ? (
                <img
                  src={business.logoUrl}
                  alt={business.name}
                  onError={() => setLogoError(true)}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="w-full h-full rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white font-black text-2xl flex items-center justify-center shadow-inner">
                  {business.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <h1 className="mt-4 text-xl font-extrabold text-slate-900 tracking-tight">
              {business.name}
            </h1>
            {business.category && (
              <p className="text-xs text-slate-600 font-medium mt-0.5">{business.category}</p>
            )}
            {business.address && (
              <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">{business.address}</p>
            )}
          </div>

          <div className="px-6 pb-8">
            <AnimatePresence mode="wait">
              {/* STAGE 1: COMPLETED (5 Stars OR Recovery Submitted) */}
              {isCompleted ? (
                <motion.div
                  key="completed"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-4 space-y-5"
                >
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>

                  {selectedRating === 5 ? (
                    <div className="space-y-4">
                      <h2 className="text-xl font-bold text-slate-900">
                        {business.googleReviewUrl ? 'A redirecionar para a avaliação...' : 'Muito obrigado pela sua avaliação!'}
                      </h2>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {business.googleReviewUrl 
                          ? 'Estamos a encaminhá-lo diretamente para a página de avaliação no Google. A sua opinião faz toda a diferença!'
                          : 'A sua nota 5 estrelas foi registada com sucesso. Agradecemos a preferência!'}
                      </p>

                      {business.googleReviewUrl && (
                        <div className="mt-4 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-center space-y-3">
                          <p className="text-xs text-slate-600">
                            Caso não seja redirecionado automaticamente, clique no botão abaixo:
                          </p>
                          <a
                            href={
                              business.googleReviewUrl.startsWith('http')
                                ? business.googleReviewUrl
                                : `https://${business.googleReviewUrl}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-full gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-md shadow-indigo-200 transition active:scale-[0.98]"
                          >
                            <span>Abrir Avaliação no Google</span>
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <h2 className="text-xl font-bold text-slate-900">
                        Obrigado pelo seu feedback sincero
                      </h2>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Recebemos a sua mensagem com prioridade. As suas respostas foram encaminhadas diretamente para a gerência de <span className="font-semibold text-slate-800">{business.name}</span>.
                      </p>
                      {wantsContact && (
                        <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-left text-xs text-emerald-800 flex items-start gap-2.5">
                          <HeartHandshake className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>
                            A nossa equipa entrará em contacto consigo através do telefone <strong>{customerPhone}</strong> para esclarecer qualquer ponto e oferecer a melhor resolução.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setSelectedRating(0);
                        setIsCompleted(false);
                        setQuestion1('');
                        setQuestion2('');
                      }}
                      className="text-xs text-slate-600 hover:text-slate-800 font-medium transition"
                    >
                      Enviar nova avaliação
                    </button>
                  </div>
                </motion.div>
              ) : selectedRating === 0 ? (
                /* STAGE 2: INITIAL RATING SCREEN (1 to 5 Stars) */
                <motion.div
                  key="star-rating"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6 text-center"
                >
                  <div className="border-t border-slate-100 pt-6">
                    <h2 className="text-lg font-bold text-slate-800">
                      Como foi a sua experiência?
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Toque numa estrela para nos avaliar em poucos segundos
                    </p>
                  </div>

                  {/* 5 Stars Rating Bar */}
                  <div className="flex justify-center items-center gap-2 sm:gap-3 py-3">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isActive = (hoveredRating || selectedRating) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          id={`star-btn-${star}`}
                          disabled={submitting}
                          onMouseEnter={() => setHoveredRating(star)}
                          onMouseLeave={() => setHoveredRating(0)}
                          onClick={() => handleSelectStar(star)}
                          className="p-1 sm:p-2 rounded-2xl transition-all duration-150 transform hover:scale-110 active:scale-95 focus:outline-none"
                          aria-label={`${star} estrelas`}
                        >
                          <Star
                            className={`w-10 h-10 sm:w-11 sm:h-11 transition-colors ${
                              isActive
                                ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                                : 'text-slate-200 fill-slate-50 hover:text-slate-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* Rating Description Label */}
                  <div className="h-6">
                    {(hoveredRating > 0 || selectedRating > 0) && (
                      <motion.span
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-full"
                      >
                        {ratingDescriptions[hoveredRating || selectedRating]}
                      </motion.span>
                    )}
                  </div>

                  <div className="pt-4 flex items-center justify-center gap-2 text-[11px] text-slate-600">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Avaliação segura e privada</span>
                  </div>
                </motion.div>
              ) : (
                /* STAGE 3: 1-4 STARS RECOVERY FORM */
                <motion.div
                  key="recovery-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= selectedRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-bold text-slate-700">
                        {selectedRating} / 5 estrelas
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRating(0)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Alterar nota
                    </button>
                  </div>

                  <div className="bg-amber-50/80 border border-amber-200/70 p-3.5 rounded-2xl">
                    <p className="text-xs font-semibold text-amber-900 mb-0.5">
                      Queremos ouvir o que aconteceu
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Lamentamos que algo não tenha saído perfeito. Este feedback é estritamente confidencial e chega de imediato à gerência.
                    </p>
                  </div>

                  <form onSubmit={handleRecoverySubmit} className="space-y-4 text-left">
                    {/* Pergunta 1: O que aconteceu? */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        1. O que aconteceu? *
                      </label>
                      <textarea
                        required
                        id="question-1-input"
                        rows={2}
                        value={question1}
                        onChange={(e) => setQuestion1(e.target.value)}
                        placeholder="Ex: Demora no atendimento, pedido incorreto, ambiente ruidoso..."
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-slate-50/50"
                      />
                    </div>

                    {/* Pergunta 2: O que poderíamos melhorar? */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        2. O que poderíamos melhorar?
                      </label>
                      <textarea
                        id="question-2-input"
                        rows={2}
                        value={question2}
                        onChange={(e) => setQuestion2(e.target.value)}
                        placeholder="A sua sugestão sincera para que a próxima visita seja impecável..."
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-slate-50/50"
                      />
                    </div>

                    {/* Pergunta 3: Gostaria que a nossa equipa entrasse em contacto consigo? */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-2">
                        3. Gostaria que a nossa equipa entrasse em contacto consigo?
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          id="contact-yes-btn"
                          onClick={() => setWantsContact(true)}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                            wantsContact
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Sim, por favor</span>
                        </button>
                        <button
                          type="button"
                          id="contact-no-btn"
                          onClick={() => setWantsContact(false)}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold border transition flex items-center justify-center gap-1.5 ${
                            !wantsContact
                              ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span>Apenas deixar o registo</span>
                        </button>
                      </div>
                    </div>

                    {/* Customer Identification */}
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          O seu Nome *
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            required
                            id="customer-name-input"
                            type="text"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Como prefere ser chamado"
                            className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Telefone / WhatsApp *
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            required
                            id="customer-phone-input"
                            type="tel"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="(11) 98765-4321"
                            className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          E-mail (Opcional)
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            id="customer-email-input"
                            type="email"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            placeholder="seuemail@exemplo.com"
                            className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      id="submit-feedback-btn"
                      disabled={submitting}
                      className="w-full mt-4 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      {submitting ? (
                        <span>A registar...</span>
                      ) : (
                        <>
                          <span>Enviar Feedback à Gerência</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Footer info */}
        <div className="mt-6 text-center text-[11px] text-slate-600 space-y-1">
          <p>Potenciado por <span className="font-semibold text-slate-600">ReputaFlow</span></p>
          <p>Feedback privado • CRM de Clientes e Recuperação</p>
        </div>
      </div>
    </div>
  );
};
