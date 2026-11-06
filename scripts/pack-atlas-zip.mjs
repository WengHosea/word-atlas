#!/usr/bin/env node
/**
 * Pack `public/atlas` into a single zip.
 *
 * The media pack is 37k small files. Copying them to a phone over USB/MTP one
 * by one takes hours; shipping one zip and letting the app unpack it takes
 * minutes.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const atlasDir = path.join(root, "public", "atlas");
const outFile = path.resolve(process.argv[2] ?? path.join(root, "..", "atlas.zip"));

if (!fs.existsSync(atlasDir)) {
  console.error(`not found: ${atlasDir}`);
  process.exit(1);
}

const dirSize = (dir) => {
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
  walk(dir);
  return { total, count };
};

const { total, count } = dirSize(atlasDir);
console.log(`packing ${count} files (${(total / 1024 / 1024).toFixed(1)} MB) -> ${outFile}`);

// `tar -a` picks the zip format from the file extension on Windows.
execFileSync("tar.exe", ["-a", "-c", "-f", outFile, "-C", path.dirname(atlasDir), path.basename(atlasDir)], {
  stdio: "inherit",
});

console.log(`done: ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB)`);
