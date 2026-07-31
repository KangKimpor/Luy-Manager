import { notFound, redirect } from "next/navigation";

import { EditTransactionForm } from "@/components/edit-transaction-form";
import { requireUser } from "@/lib/auth";
import { listAccountBalances } from "@/lib/data/accounts";
import { listCategories } from "@/lib/data/reference";
import { getTransaction } from "@/lib/data/transactions";

export default async function EditTransactionPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();

  const { id } = await props.params;
  const [transaction, accounts, categories] = await Promise.all([
    getTransaction(id),
    listAccountBalances(),
    listCategories(),
  ]);

  // Row Level Security means someone else's row reads as missing.
  if (!transaction) notFound();

  // A transfer leg has a counterpart that must stay balanced, so it cannot be
  // amended as a standalone transaction — migration 0004 would refuse the commit.
  // Sent back rather than shown a form that cannot save.
  if (transaction.type === "transfer") redirect("/transactions");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">Edit transaction</h1>
      </header>

      <EditTransactionForm
        transaction={transaction}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}
