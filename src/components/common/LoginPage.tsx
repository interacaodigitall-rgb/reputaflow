import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, LogIn, AlertCircle, RefreshCw } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export const LoginPage: React.FC = () => {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('eunawebse@gmail.com');
  const [password, setPassword] = useState('reputa123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/wrong-password') {
        setError('Senha incorreta. Por favor, verifique a senha introduzida.');
      } else if (err.code === 'auth/invalid-email') {
        setError('O e-mail introduzido não é válido.');
      } else if (err.code === 'auth/user-disabled') {
        setError('Esta conta foi desativada pelo administrador.');
      } else {
        setError(
          'Erro ao autenticar. Verifique os dados introduzidos e tente novamente.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdminLogin = async (targetEmail: string) => {
    setEmail(targetEmail);
    setPassword('reputa123');
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(targetEmail, 'reputa123');
    } catch (err) {
      console.error('Admin quick login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = (type: 'admin' | 'merchant') => {
    setError(null);
    if (type === 'admin') {
      setEmail('eunawebse@gmail.com');
      setPassword('reputa123');
      setInfoMessage('Conta de Administrador Geral (eunawebse@gmail.com). Permite gerir todos os estabelecimentos, cadastrar comércios e configurações.');
    } else {
      setEmail('comerciante@reputaflow.com');
      setPassword('reputa123');
      setInfoMessage('Conta demo de Comerciante. Permite testar o CRM de avaliações, QR Code e fluxos de recuperação.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50/60 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-3xl border border-slate-200 shadow-xl transition-all duration-300">
        
        {/* Logo and Brand Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              Aceda à sua plataforma
            </h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Controle a reputação do seu negócio, recupere clientes insatisfeitos e cresça em qualquer mercado (Brasil e Europa)
            </p>
          </div>
        </div>

        {/* Error / Alert Section */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-xs font-semibold flex items-start gap-2.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Info Feedback Section */}
        {infoMessage && (
          <div className="p-3.5 bg-indigo-50 border border-indigo-100 text-indigo-800 rounded-2xl text-xs font-medium flex items-start gap-2.5 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label htmlFor="email-address" className="block text-xs font-bold text-slate-700 mb-1">
                Endereço de E-mail
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 pr-3 py-2.5 w-full text-xs rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  placeholder="exemplo@reputaflow.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-xs font-bold text-slate-700">
                  Senha
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-3 py-2.5 w-full text-xs rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  placeholder="Introduza a sua senha"
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{loading ? 'A autenticar...' : 'Entrar na Conta'}</span>
            </button>
          </div>
        </form>

        {/* Quick Admin Access Section */}
        <div className="pt-4 border-t border-slate-200 space-y-2">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center">
            Acesso Rápido de Administrador
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickAdminLogin('eunawebse@gmail.com')}
              className="w-full py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 border border-indigo-100 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <span>👑 Entrar como Super Admin (eunawebse@gmail.com)</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickAdminLogin('reputa@glowfyhub.com')}
                className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-[11px] transition text-center cursor-pointer"
              >
                👑 reputa@glowfyhub
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleFillDemo('merchant')}
                className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-[11px] transition text-center cursor-pointer"
              >
                💼 Preencher Comerciante
              </button>
            </div>
          </div>
        </div>

        {/* Google SSO Fallback */}
        <div className="pt-3 flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-400 font-medium">Ou se preferir</span>
          <button
            type="button"
            onClick={signInWithGoogle}
            className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
          >
            Entrar com conta Google
          </button>
        </div>

        {/* Footnote branding */}
        <div className="text-center pt-2">
          <p className="text-[10px] text-slate-400">
            © {new Date().getFullYear()} ReputaFlow. Todos os direitos reservados.
          </p>
          <p className="text-[9px] text-slate-400/80 mt-0.5">
            Operação internacional: Brasil (R$) & Europa (€)
          </p>
        </div>

      </div>
    </div>
  );
};
