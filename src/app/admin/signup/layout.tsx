import { AuthHero } from "@/components/auth/AuthHero";

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex">
      <AuthHero />
      {children}
    </div>
  );
}
