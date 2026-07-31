"use client";

import { Mail, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

/**
 * Google OAuth and magic-link sign-in.
 *
 * A client component because both flows start in the browser: OAuth needs to
 * navigate the top-level window to Google, and the magic-link form wants inline
 * feedback without a full round trip. Both hand off to `/auth/callback`, which is
 * where the session cookie is actually set.
 */

/** Only ever return somewhere inside this app after signing in. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function LoginForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sent, setSent] = useState(false);

  const callbackUrl = (): string => {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", safeNext(next));
    return url.toString();
  };

  async function signInWithGoogle() {
    setError(null);
    setPending("google");

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });

    // On success the browser navigates away, so reaching here means it failed.
    if (oauthError) {
      setError(oauthError.message);
      setPending(null);
    }
  }

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending("email");

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });

    setPending(null);
    if (otpError) setError(otpError.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <Card>
        <CardBody className="space-y-2 text-center">
          <Mail size={24} className="text-brand mx-auto" aria-hidden="true" />
          <p className="text-ink text-sm font-semibold">Check your email</p>
          <p className="text-ink-muted text-sm">
            We sent a sign-in link to {email.trim()}. It works once and expires
            shortly.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-brand text-sm font-semibold underline"
          >
            Use a different address
          </button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <Button
          size="full"
          variant="secondary"
          onClick={signInWithGoogle}
          disabled={pending !== null}
        >
          {pending === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>

        <div className="flex items-center gap-3">
          <span className="bg-border-subtle h-px flex-1" />
          <span className="text-ink-faint text-xs font-semibold uppercase">or</span>
          <span className="bg-border-subtle h-px flex-1" />
        </div>

        <form onSubmit={signInWithEmail} className="space-y-3">
          <div>
            <label
              htmlFor="email"
              className="text-ink-muted mb-2 block text-xs font-semibold tracking-wide uppercase"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="border-border-subtle bg-surface rounded-card text-ink placeholder:text-ink-faint min-h-11 w-full border px-3 text-sm"
            />
          </div>

          <Button
            size="full"
            type="submit"
            disabled={pending !== null || email.trim() === ""}
          >
            <Mail size={16} aria-hidden="true" />
            {pending === "email" ? "Sending…" : "Email me a link"}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-outflow flex items-start gap-1.5 text-sm">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <p className="text-ink-faint text-xs">
          No password to forget. Both routes create the same account, so you can
          switch between them later.
        </p>
      </CardBody>
    </Card>
  );
}
