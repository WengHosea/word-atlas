import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.haoxin.wordatlas",
  appName: "WordAtlas",
  webDir: "dist",
  android: {
    // The WebView loads local media through the _capacitor_file_ protocol and
    // loads the app bundle from http://localhost, so mixed content is allowed.
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
    SystemBars: {
      // "css" makes Capacitor inject the real system bar insets as the
      // `--safe-area-inset-*` custom properties. That matters because the
      // WebView on Android 15 edge-to-edge devices may be older than
      // Chromium 140, where `env(safe-area-inset-*)` is always 0. Without
      // this the sticky header ends up underneath the status bar and its
      // buttons cannot be tapped. The stylesheet combines both sources via
      // `--sat-*`, so each inset is applied exactly once either way.
      insetsHandling: "css",
      // The web app already declares `viewport-fit=cover`; telling the
      // plugin up front avoids a layout jump on the very first frame.
      initialViewportFitValueHint: "cover",
      style: "DEFAULT",
      hidden: false,
    },
  },
};

export default config;
