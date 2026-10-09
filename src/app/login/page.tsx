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
 * common, and because it is the only way to sign in during local development
 * without configuring an OAuth client.
 */
export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // searchParams is async in this version of Next.js.
  const { next, error } = await props.searchParams;

  return (
    <div className="login-page space-y-8">
      <header className="pt-8 text-center">
        <p className="text-brand mb-5 text-sm font-semibold">Luy Manager</p>
        <h1 className="text-ink text-4xl font-semibold tracking-tight">Money, made clearer.</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Track dollars and riel side by side.
        </p>
      </header>

      {isDemoMode() ? (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-ink text-sm font-semibold">Running on demo data</p>
            <p className="text-ink-muted text-sm">
              Explore with sample data. Saving and sign-in are not available in this demo.
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
