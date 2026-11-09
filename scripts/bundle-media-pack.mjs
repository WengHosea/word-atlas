#!/usr/bin/env node
/**
 * Bundle the offline media pack into the Android APK's assets.
 *
 * Pushing 600 MB of media onto the phone by hand is error-prone and, on
 * Android 11+, impossible without "all files access" because the app
 * cannot read `Download/`. Shipping the pack inside the APK removes that
 * whole step: the app streams the archive out of its own assets on first
 * launch and unpacks it into its private folder.
 *
 * The archive is written to `android/app/src/main/assets/atlas.zip`, which
 * Gradle copies into the APK verbatim.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const atlasDir = path.join(root, "public", "atlas");
const assetsDir = path.join(root, "android", "app", "src", "main", "assets");
const outFile = path.join(assetsDir, "atlas.zip");

// Skip when the caller only wants the web bundle.
if (process.argv.includes("--skip")) {
  console.log("bundle-media-pack: skipped on request");
  process.exit(0);
}

if (!fs.existsSync(atlasDir)) {
  console.error(`bundle-media-pack: not found: ${atlasDir}`);
  process.exit(1);
}

// Count first so the log tells us whether the media was actually present.
let total = 0;
let count = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else {
      total += fs.statSync(p).size;
      count++;
    }
  }
};
walk(atlasDir);

if (count < 1000) {
  console.error(
    `bundle-media-pack: only ${count} media files found in ${atlasDir}. ` +
      "The checkout is probably missing the media pack.",
  );
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });
if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });

console.log(
  `bundle-media-pack: packing ${count} files (${(total / 1024 / 1024).toFixed(1)} MB) ...`,
);

// `tar -a` picks the zip format from the file extension.
execFileSync(
  "tar",
  ["-a", "-c", "-f", outFile, "-C", path.dirname(atlasDir), path.basename(atlasDir)],
  { stdio: "inherit" },
);

const mb = fs.statSync(outFile).size / 1024 / 1024;
console.log(`bundle-media-pack: wrote ${outFile} (${mb.toFixed(1)} MB)`);
