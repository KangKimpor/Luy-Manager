import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { Card, CardBody } from "@/components/ui/card";
import { isDemoMode } from "@/lib/auth";

/**
 * Sign in (PRD Section 4, with Supabase Auth per Section 17 decision 4).
 *
 * Two routes in, for different reasons. Google OAuth is one tap and the option
 * most people will take. A magic link exists because it needs no password and no
 * Google account, which matters where a shared or feature-phone-adjacent setup is
 * common — and because it is the only way to sign in during local development
 * without configuring an OAuth client.
 */
export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // searchParams is async in this version of Next.js.
  const { next, error } = await props.searchParams;

  return (
    <div className="space-y-4">
      <header className="pt-6 text-center">
        <h1 className="text-ink text-2xl font-bold">Luy Manager</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Track dollars and riel side by side.
        </p>
      </header>

      {isDemoMode() ? (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-ink text-sm font-semibold">Running on demo data</p>
            <p className="text-ink-muted text-sm">
              No Supabase project is configured, so there is nothing to sign in to
              and nothing is saved. Copy <code>.env.example</code> to{" "}
              <code>.env.local</code> and fill in your project URL and anon key to
              enable accounts.
            </p>
            <Link href="/" className="text-brand inline-block text-sm font-semibold underline">
              Continue to the demo
            </Link>
          </CardBody>
        </Card>
      ) : (
        <LoginForm next={next} initialError={error} />
      )}
    </div>
  );
}
