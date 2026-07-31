import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="space-y-4 pt-6">
      <Card>
        <CardBody className="space-y-3 text-center">
          <h1 className="text-ink text-lg font-bold">That page does not exist</h1>
          <p className="text-ink-muted text-sm">
            The link may be out of date, or the transaction or account it pointed at
            may have been deleted.
          </p>
          {/* Styled as a button rather than wrapped in one: an anchor inside a
              button is invalid HTML and breaks keyboard navigation. */}
          <Link
            href="/"
            className={buttonVariants({ variant: "secondary", size: "full" })}
          >
            Back to the dashboard
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
