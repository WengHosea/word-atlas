"""Recompute the media bit flags in `index.json` and `entries/*.json`.

The bit flags tell the app which media files exist for a word:

    1 = img, 2 = uk, 4 = us, 8 = ex, 16 = ex2

The flags are stored in the dataset, so a newly generated recording is
invisible to the app until the flags are refreshed. This script walks the
media tree once and rewrites the flags to match what is actually on disk.

Usage: python3 scripts/atlas/fix_media_flags.py [--atlas public/atlas]
"""
import argparse
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]

BIT_UK, BIT_US, BIT_EX, BIT_EX2, BIT_IMG = 2, 4, 8, 16, 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--atlas", default=str(ROOT / "public" / "atlas"))
    a = ap.parse_args()
    pub = pathlib.Path(a.atlas).resolve()

    def has(folder, slug):
        p = pub / folder / f"{slug}.mp3"
        return p.exists() and p.stat().st_size > 2000

    def has_img(slug):
        p = pub / "img" / f"{slug}.webp"
        return p.exists() and p.stat().st_size > 1000

    # 1. The per-entry chunks carry the authoritative "m" flag.
    changed = 0
    total = 0
    for p in sorted((pub / "entries").glob("*.json")):
        entries = json.loads(p.read_text(encoding="utf-8"))
        dirty = False
        for e in entries:
            slug = e["id"]
            m = 0
            if has_img(slug):
                m |= BIT_IMG
            if has("audio/uk", slug):
                m |= BIT_UK
            if has("audio/us", slug):
                m |= BIT_US
            if has("audio/ex", slug):
                m |= BIT_EX
            if has("audio/ex2", slug):
                m |= BIT_EX2
            total += 1
            if e.get("m") != m:
                e["m"] = m
                dirty = True
                changed += 1
        if dirty:
            p.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"entries: {total}, flags updated: {changed}", flush=True)

    # 2. The index carries the same flags in its compact rows.
    idx_path = pub / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    changed_idx = 0
    for row in idx["words"]:
        slug = row[0]
        m = 0
        if has_img(slug):
            m |= BIT_IMG
        if has("audio/uk", slug):
            m |= BIT_UK
        if has("audio/us", slug):
            m |= BIT_US
        if has("audio/ex", slug):
            m |= BIT_EX
        if has("audio/ex2", slug):
            m |= BIT_EX2
        if row[6] != m:
            row[6] = m
            changed_idx += 1
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"index rows: {len(idx['words'])}, flags updated: {changed_idx}", flush=True)


if __name__ == "__main__":
    main()
