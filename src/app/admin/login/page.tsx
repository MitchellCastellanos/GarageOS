import { ADMIN } from "@/lib/routes";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { LoginForm } from "@/components/auth/LoginForm";

interface Props {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { error, callbackUrl } = await searchParams;
  const destination = callbackUrl ?? ADMIN.dashboard;

  return (
    <AuthPanel variant="login">
      <LoginForm error={error} destination={destination} />

      {/* Build tag — tells you instantly which deployment is live */}
      <p className="text-center text-xs text-slate-400 mt-2">
        build: {process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"}
      </p>
    </AuthPanel>
  );
}
