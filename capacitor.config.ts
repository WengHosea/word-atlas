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
  },
};

export default config;
