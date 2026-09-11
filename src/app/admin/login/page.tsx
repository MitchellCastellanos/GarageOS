import { ADMIN } from "@/lib/routes";
import { APP_NAME } from "@/config/app";

interface Props {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error, callbackUrl } = await searchParams;

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
        <p className="text-slate-500 text-sm mt-1">Sistema de gestión</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-6">Iniciar sesión</h2>

        <form action="/api/auth/login" method="POST" className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ADMIN.dashboard} />

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="info@tutaller.com" />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••" />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors">
            Entrar
          </button>
        </form>
      </div>

      {/* Build tag — tells you instantly which deployment is live */}
      <p className="text-center text-xs text-slate-400 mt-4">
        build: {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"}
      </p>
    </div>
  );
}
