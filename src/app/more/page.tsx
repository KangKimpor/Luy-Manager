import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { MORE_NAV } from "@/lib/navigation";

export default function MorePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-ink-muted">A little more control over your money.</p>
      <Card className="overflow-hidden">
        {MORE_NAV.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="border-surface-variant hover:bg-surface-muted flex items-center gap-4 border-b p-5 transition-colors last:border-0">
            <span className="bg-brand-soft text-brand flex size-12 shrink-0 items-center justify-center rounded-2xl"><Icon size={22} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="text-ink block font-semibold">{label}</span><span className="text-ink-muted mt-1 block text-sm">{description}</span></span>
            <ChevronRight size={18} className="text-ink-faint" aria-hidden="true" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
