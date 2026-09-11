import Link from "next/link";
import Image from "next/image";
import { Mail, User, Building2 } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { PasswordField } from "@/components/auth/PasswordField";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <AuthPanel topBarText="¿Ya tienes cuenta?" topBarLinkHref={ADMIN.login} topBarLinkLabel="Iniciar sesión">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
        <div className="text-center mb-3">
          <Image
            src="/brand/logo-stacked.png"
            alt="GarageOS"
            width={480}
            height={320}
            className="h-9 w-auto mx-auto mb-2"
            priority
          />
          <h1 className="text-xl font-bold text-slate-900">Crea tu cuenta</h1>
          <p className="text-slate-500 text-sm mt-1">Empieza a usar GarageOS en tu taller</p>
        </div>

        <form action="/api/auth/signup" method="POST" className="space-y-2">
          <div>
            <label htmlFor="shopName" className="block text-sm font-medium text-slate-700 mb-1">
              Nombre del taller
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="shopName"
                name="shopName"
                type="text"
                autoComplete="organization"
                required
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Taller El Rápido"
              />
            </div>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
              Tu nombre
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Alex Martínez"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
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
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="tu@taller.com"
              />
            </div>
          </div>

          <PasswordField
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            minLength={8}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            Crear cuenta
          </button>
        </form>

        <div className="flex items-center gap-3 my-2.5">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="text-xs text-slate-400">o</span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        <GoogleSignInButton callbackUrl={ADMIN.dashboard} label="Registrarte con Google" />

        <p className="text-center text-xs text-slate-400 mt-2.5">
          Al crear una cuenta aceptas nuestros{" "}
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
    </AuthPanel>
  );
}
