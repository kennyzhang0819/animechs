import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell around the static export (npm run build:mobile → out/).
 * Capacitor serves out/ at the root of its local scheme
 * (capacitor://localhost on iOS, https://localhost on Android), so the
 * game's absolute fetches — /levels/1.json, /maps/… — resolve unchanged.
 */
const config: CapacitorConfig = {
  appId: "com.swarmdustry.game",
  appName: "Swarmdustry",
  webDir: "out",
  ios: {
    // the game paints its own background; avoid a white flash at launch
    backgroundColor: "#0B0B0D",
  },
  android: {
    backgroundColor: "#0B0B0D",
  },
};

export default config;
