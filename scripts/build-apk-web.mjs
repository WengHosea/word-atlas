#!/usr/bin/env node
/**
 * Build the web bundle for the Android shell.
 *
 * The atlas media (7,298 illustrations + 22,905 audio clips) lives in
 * `public/atlas` and would be copied into `dist/` by a plain `vite build`,
 * which makes the APK gigabytes big. This script moves the media out of the
 * way, builds a clean bundle, and puts the media back — whether the build
 * succeeds or fails.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const atlasDir = path.join(root, "public", "atlas");
const stashDir = path.join(root, ".media_stash");

/** Media folders that must not end up inside the APK. */
const MEDIA_DIRS = ["img", "thumb", "audio"];
/** Data that must stay inside the APK so the app can boot. */
const KEEP = ["index.json", "entries"];

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
};

const dirSize = (dir) => {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return total;
};

const move = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch {
    // Renaming across devices fails; fall back to a copy.
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
};

function stashMedia() {
  fs.mkdirSync(stashDir, { recursive: true });
  const moved = [];
  for (const name of MEDIA_DIRS) {
    const from = path.join(atlasDir, name);
    if (!fs.existsSync(from)) continue;
    const to = path.join(stashDir, name);
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    console.log(`  stashing public/atlas/${name}`);
    move(from, to);
    moved.push(name);
  }
  return moved;
}

function restoreMedia(moved) {
  for (const name of moved) {
    const from = path.join(stashDir, name);
    const to = path.join(atlasDir, name);
    if (!fs.existsSync(from)) continue;
    console.log(`  restoring public/atlas/${name}`);
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    move(from, to);
  }
  try {
    if (fs.existsSync(stashDir) && fs.readdirSync(stashDir).length === 0) fs.rmdirSync(stashDir);
  } catch {
    /* leave the empty stash folder alone */
  }
}

function reportSize() {
  const dist = path.join(root, "dist");
  if (!fs.existsSync(dist)) return;
  const mb = dirSize(dist) / (1024 * 1024);
  console.log(`\ndist/ is ${mb.toFixed(1)} MB`);
  if (mb > 120) console.warn("WARNING: dist/ is larger than expected; the media may not have been stashed.");
}

function printAdbHint() {
  const pack = path.join(root, "public", "atlas");
  console.log(`
--------------------------------------------------------------------------
Media pack ready to push to the phone.

  Source : ${pack}
  Target : /sdcard/Android/data/com.haoxin.wordatlas/files/atlas

  adb shell mkdir -p /sdcard/Android/data/com.haoxin.wordatlas/files/atlas
  adb push "${pack}\\" /sdcard/Android/data/com.haoxin.wordatlas/files/atlas
  adb shell "cd /sdcard/Android/data/com.haoxin.wordatlas/files/atlas && find . -name .nomedia -delete"
--------------------------------------------------------------------------
`);
}

let moved = [];
try {
  console.log("Stashing media out of public/atlas ...");
  moved = stashMedia();
  console.log(`\nBuilding the web bundle (${moved.length} media folders stashed) ...`);
  run("npx tsc -b");
  run("npx vite build");
} catch (err) {
  console.error("\nBuild failed:", err.message);
  process.exitCode = 1;
} finally {
  console.log("\nRestoring media ...");
  restoreMedia(moved);
  reportSize();
}

if (!process.exitCode) {
  // Android skips media indexers in folders that contain a .nomedia file.
  const nomedia = path.join(root, "public", "atlas", ".nomedia");
  try {
    fs.writeFileSync(nomedia, "");
  } catch {
    /* optional */
  }
  printAdbHint();
}
