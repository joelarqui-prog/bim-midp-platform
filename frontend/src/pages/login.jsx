import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Layers, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isLoading } = useAuthStore();
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user]);

  const onSubmit = async ({ email, password }) => {
    setError('');
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-950 via-brand-950 to-surface-900
                    flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.5) 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center mb-3 shadow-glow">
              <Layers size={22} className="text-white" />
            </div>
            <h1 className="font-display font-bold text-white text-2xl tracking-tight">MIDP</h1>
            <p className="text-white/40 text-sm font-mono uppercase tracking-widest mt-0.5">
              BIM Platform · ISO 19650
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="usuario@empresa.com"
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20
                           text-white placeholder-white/30 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent
                           transition-all"
                {...register('email', { required: 'El correo es obligatorio.' })}
              />
              {errors.email && (
                <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20
                             text-white placeholder-white/30 text-sm pr-10
                             focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent
                             transition-all"
                  {...register('password', { required: 'La contraseña es obligatoria.' })}
                />
                <button type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30
                              text-red-400 text-sm px-4 py-2.5 rounded-xl">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm
                         hover:bg-brand-600 transition-colors shadow-lg shadow-brand-500/25
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2 mt-2">
              {isLoading
                ? <><Loader2 size={15} className="animate-spin" /> Iniciando sesión...</>
                : 'Iniciar sesión'
              }
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 text-center">
            <p className="text-white/25 text-xs">
              El acceso es únicamente por invitación del administrador.
            </p>
          </div>
        </div>

        {/* Demo credentials */}
        <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 text-center">
          <p className="text-white/40 text-xs font-semibold uppercase tracking-wide mb-2">
            Credenciales de demo
          </p>
          <p className="text-white/60 font-mono text-xs">admin@midp.bim</p>
          <p className="text-white/60 font-mono text-xs">Admin@2025</p>
        </div>
      </div>
    </div>
  );
}
