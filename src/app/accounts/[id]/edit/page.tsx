import { notFound } from "next/navigation";

import { AccountForm } from "@/components/account-form";
import { requireUser } from "@/lib/auth";
import { getAccount } from "@/lib/data/accounts";

export default async function EditAccountPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  // params is a promise in this version of Next.js.
  const { id } = await props.params;
  const account = await getAccount(id);

  // Row Level Security means someone else's account reads as missing, which is the
  // right amount to disclose.
  if (!account) notFound();

  return (
    <div className="space-y-4">
      <header>
        {/* The bar says "Edit account"; which account is the useful part here. */}
        <p className="text-ink text-numeric-md">{account.name}</p>
      </header>

      <AccountForm account={account} />
    </div>
  );
}
