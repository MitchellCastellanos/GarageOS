import { AuthPanel } from "@/components/auth/AuthPanel";
import { SignupForm } from "@/components/auth/SignupForm";
import { HANDOFF_QUERY, sanitizeHandoff, signupAttributionEnabled } from "@/lib/analytics/signup-attribution";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignupPage({ searchParams }: Props) {
  const params = await searchParams;
  const errorParam = params.error;
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam;
  // Optional analytics hand-off (?from=…&lang=…): read only when the server flag is on, validated, and echoed as hidden inputs. Never required.
  const handoff = signupAttributionEnabled()
    ? sanitizeHandoff(Object.fromEntries(HANDOFF_QUERY.map((k) => [k, params[k]])))
    : undefined;

  return (
    <AuthPanel variant="signup">
      <SignupForm error={error} handoff={handoff} />
    </AuthPanel>
  );
}
