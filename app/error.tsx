"use client";

import CrashScreen from "@/components/CrashScreen";

/**
 * Every screen under app/ that throws while rendering lands here — the
 * menu, the game, the editors. `reset` re-renders the subtree, which is
 * worth one press before a player reaches for the menu.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return <CrashScreen error={error} digest={error.digest} onRetry={reset} />;
}
