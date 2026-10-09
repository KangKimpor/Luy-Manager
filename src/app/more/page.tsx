import { ChevronRight, Send } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { MORE_NAV } from "@/lib/navigation";
import { buttonVariants } from "@/components/ui/button";

export default function MorePage() {
  return (
    <div className="page-enter stagger-children mx-auto max-w-2xl space-y-6">
      <p className="text-ink-muted text-sm">Make room for the bigger picture.</p>
      <Card className="stagger-children overflow-hidden">
        {MORE_NAV.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="group border-surface-variant hover:bg-surface-muted flex items-center gap-4 border-b p-5 transition-colors last:border-0">
            <span className="bg-brand-soft text-brand flex size-12 shrink-0 items-center justify-center rounded-2xl"><Icon size={22} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="text-ink block font-semibold">{label}</span><span className="text-ink-muted mt-1 block text-sm">{description}</span></span>
            <ChevronRight size={18} className="text-ink-faint transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        ))}
      </Card>
      <Card className="bg-brand-soft border-0 p-6">
        <Send size={24} className="text-brand mb-4" aria-hidden="true" />
        <h2 className="text-ink text-lg font-semibold">Your money, in a message.</h2>
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">Connect @LuyManagerBot and keep your ledger up to date from Telegram.</p>
        <Link href="/settings" className={buttonVariants({ variant: "primary", className: "mt-5" })}>Connect Telegram<ChevronRight size={16} aria-hidden="true" /></Link>
      </Card>
    </div>
  );
}
