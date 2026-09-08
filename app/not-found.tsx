import CrashScreen from "@/components/CrashScreen";

/**
 * A URL with nothing behind it — a stale bookmark, a typed path, a link
 * into a build that no longer has that screen. The framework's own 404 is
 * a white page with a version-stamped byline on it; this is the game
 * saying there is no sector there.
 */
export default function NotFound(): React.JSX.Element {
  return <CrashScreen kind="lost" />;
}
