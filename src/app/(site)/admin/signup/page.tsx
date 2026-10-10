import { AuthPanel } from "@/components/auth/AuthPanel";
import { SignupForm } from "@/components/auth/SignupForm";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <AuthPanel variant="signup">
      <SignupForm error={error} />
    </AuthPanel>
  );
}
