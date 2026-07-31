import { Card, CardBody } from "@/components/ui/card";

/**
 * Marks a route that exists in the navigation but whose feature is scheduled for
 * a later phase in PRD Section 16.
 *
 * The route is real rather than hidden so the bottom navigation matches PRD
 * Section 15 exactly, and so a tap lands somewhere that explains itself rather
 * than 404ing.
 */
export function PhasePlaceholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-ink text-2xl font-bold">{title}</h1>
        <p className="text-ink-muted text-sm">{phase}</p>
      </header>

      <Card>
        <CardBody className="pt-4">
          <div className="text-ink-muted space-y-2 text-sm">{children}</div>
        </CardBody>
      </Card>
    </div>
  );
}
