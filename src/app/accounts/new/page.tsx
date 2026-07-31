import { AccountForm } from "@/components/account-form";
import { Card, CardBody } from "@/components/ui/card";
import { isDemoMode, requireUser } from "@/lib/auth";

export default async function NewAccountPage() {
  if (isDemoMode()) {
    return (
      <div className="space-y-4">
        <Card>
          <CardBody>
            <p className="text-ink-muted text-sm">
              The demo runs on sample data, so there is nowhere to save an account.
              Connect Supabase to create your own.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Guards the page as well as the action. The action would refuse anyway, but
  // rendering a form that cannot submit wastes the user's time.
  await requireUser();

  return (
    <div className="space-y-4">
      {/* Title comes from the app bar; this is the part it cannot say. */}
      <p className="text-ink-muted text-body-md">
        Most banks here hold separate USD and KHR accounts. Add one for each.
      </p>

      <AccountForm />
    </div>
  );
}
