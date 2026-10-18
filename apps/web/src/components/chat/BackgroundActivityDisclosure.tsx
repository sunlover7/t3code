import type { ReactNode } from "react";

/** Presentation only: original messages and model input stay intact. Callers
 * keep outcomes and decisions outside this group. */
export function BackgroundActivityDisclosure({
  eventCount,
  children,
}: {
  eventCount: number;
  children: ReactNode;
}) {
  return (
    <details className="rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
      <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
        Background activity · {eventCount} {eventCount === 1 ? "event" : "events"}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
