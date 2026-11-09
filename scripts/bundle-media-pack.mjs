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

packZip(atlasDir, outFile);

/**
 * Create a real ZIP archive of the media tree.
 *
 * This must not be done with `tar -a`: that flag is a BSD tar extension.
 * GNU tar (the default `tar` on the Ubuntu CI runner) silently ignores it
 * and writes a *tar* file with a `.zip` name. The Android side opens the
 * pack with `java.util.zip.ZipFile`, which rejects a tar file — the app
 * then unpacks nothing and shows no illustrations and no audio, while the
 * build looks perfectly green.
 *
 * `jar cMf` (JDK, present both in CI and on the author's machine) always
 * writes a real ZIP with deflated entries and no extra manifest.
 */
function packZip(atlasDir, outFile) {
  const jar = process.platform === "win32" ? "jar.exe" : "jar";
  execFileSync(jar, ["cMf", path.resolve(outFile), path.basename(atlasDir)], {
    cwd: path.dirname(atlasDir),
    stdio: "inherit",
  });
}

// Fail loudly here instead of shipping a broken APK: the first two bytes of
// a ZIP archive are always "PK".
const magic = fs.readFileSync(outFile).subarray(0, 2).toString("latin1");
if (magic !== "PK") {
  console.error(
    `bundle-media-pack: ${outFile} is not a ZIP archive (magic=${JSON.stringify(magic)}). ` +
      "The packer produced a different format; the app could never unpack it.",
  );
  process.exit(1);
}

const mb = fs.statSync(outFile).size / 1024 / 1024;
console.log(`bundle-media-pack: wrote ${outFile} (${mb.toFixed(1)} MB)`);
