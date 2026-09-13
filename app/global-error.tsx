"use client";

import CrashScreen from "@/components/CrashScreen";
import "./globals.css";

/**
 * The floor under the floor: a throw in the root layout itself, where the
 * layout — its fonts, its build stamp, the crash guard — never mounted.
 * This has to render its own <html> and <body>, and the fault screen it
 * shows carries all of its own styling for exactly this case.
 *
 * The default here is a bare white page reading "Application error: a
 * client-side exception has occurred" over the toolkit's name. That page
 * is the whole reason this file exists.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}): React.JSX.Element {
  return (
    <html lang="en">
      <head>
        <title>Animechs</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, background: "#0B0B0D" }}>
        <CrashScreen
          error={error}
          digest={error.digest}
          onRetry={() => window.location.reload()}
        />
      </body>
    </html>
  );
}
