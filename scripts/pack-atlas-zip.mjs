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

// `tar -a` is a BSD tar extension; GNU tar ignores it and writes a tar file
// with a `.zip` name, which `java.util.zip.ZipFile` cannot open. `jar cMf`
// always produces a real ZIP.
const jar = process.platform === "win32" ? "jar.exe" : "jar";
execFileSync(jar, ["cMf", path.resolve(outFile), path.basename(atlasDir)], {
  cwd: path.dirname(atlasDir),
  stdio: "inherit",
});

const magic = fs.readFileSync(outFile).subarray(0, 2).toString("latin1");
if (magic !== "PK") {
  console.error(`pack-atlas-zip: ${outFile} is not a ZIP archive (magic=${JSON.stringify(magic)})`);
  process.exit(1);
}

console.log(`done: ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB)`);
