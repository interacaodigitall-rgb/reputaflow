import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, LogIn, AlertCircle, RefreshCw } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('reputa@glowfyhub.com');
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

  const handleFillDemo = (type: 'admin' | 'merchant') => {
    setError(null);
    if (type === 'admin') {
      setEmail('reputa@glowfyhub.com');
      setPassword('reputa123');
      setInfoMessage('Conta de Administrador Geral. Permite gerir todos os estabelecimentos, moedas (Euro/Real) e configurações.');
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
          <img
            src="https://i.postimg.cc/Y974HYRZ/logo-png.png"
            alt="ReputaFlow Logo"
            className="h-16 mx-auto object-contain transition-transform hover:scale-102 duration-300"
            referrerPolicy="no-referrer"
          />
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

        {/* Demo Fast Access Section */}
        <div className="pt-4 border-t border-slate-200">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center mb-2.5">
            Acesso Rápido para Teste
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleFillDemo('admin')}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-[11px] transition text-center"
            >
              👑 Administrador
            </button>
            <button
              type="button"
              onClick={() => handleFillDemo('merchant')}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-[11px] transition text-center"
            >
              💼 Comerciante
            </button>
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
