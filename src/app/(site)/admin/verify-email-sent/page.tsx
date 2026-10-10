import { AuthPanel } from "@/components/auth/AuthPanel";
import { VerifyEmailSentCard } from "@/components/auth/VerifyEmailSentCard";

interface Props {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailSentPage({ searchParams }: Props) {
  const { email } = await searchParams;

  return (
    <AuthPanel variant="login">
      <VerifyEmailSentCard email={email ?? ""} />
    </AuthPanel>
  );
}
