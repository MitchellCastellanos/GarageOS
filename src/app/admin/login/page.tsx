import Link from "next/link";
import Image from "next/image";
import { Mail } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { PasswordField } from "@/components/auth/PasswordField";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface Props {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error, callbackUrl } = await searchParams;
  const destination = callbackUrl ?? ADMIN.dashboard;

  return (
    <AuthPanel topBarText="¿Nuevo en GarageOS?" topBarLinkHref={ADMIN.signup} topBarLinkLabel="Crear cuenta">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-5">
          <Image
            src="/brand/logo-stacked.png"
            alt="GarageOS"
            width={480}
            height={320}
            className="h-12 w-auto mx-auto mb-3"
            priority
          />
          <h1 className="text-2xl font-bold text-slate-900">Bienvenido de nuevo</h1>
          <p className="text-slate-500 text-sm mt-1">Inicia sesión en tu cuenta</p>
        </div>

        <form action="/api/auth/login" method="POST" className="space-y-3">
          <input type="hidden" name="callbackUrl" value={destination} />

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="tu@taller.com"
              />
            </div>
          </div>

          <PasswordField />

          <div className="flex justify-end -mt-2">
            <Link href="#" className="text-sm text-blue-600 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            Iniciar sesión
          </button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="text-xs text-slate-400">o</span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        <GoogleSignInButton callbackUrl={destination} />

        <p className="text-center text-xs text-slate-400 mt-4">
          Al iniciar sesión aceptas nuestros{" "}
          <Link href="#" className="text-slate-500 hover:underline">
            Términos de servicio
          </Link>{" "}
          y{" "}
          <Link href="#" className="text-slate-500 hover:underline">
            Política de privacidad
          </Link>
          .
        </p>
      </div>

      {/* Build tag — tells you instantly which deployment is live */}
      <p className="text-center text-xs text-slate-400 mt-2">
        build: {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"}
      </p>
    </AuthPanel>
  );
}
