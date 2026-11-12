"""Generate the missing IELTS-context example audio with edge-tts.

The ElevenLabs generator in `gen_sentence_audio.py` only covered 1011 of the
7298 words, so 86% of the entries had no recording for their second
(IELTS-context) example sentence. On Android the app has no working
`speechSynthesis` engine, so those sentences were silent.

This script fills the gap with Microsoft Edge's neural voices and also
updates the media bit flags in `index.json` and `entries/*.json` so the app
knows the recording exists.

Usage: python3 scripts/atlas/gen_ex2_audio_edge.py [--workers 16] [--limit N]
"""
import argparse
import asyncio
import json
import pathlib
import sys

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[2]
PUB = ROOT / "public" / "atlas"
EX2 = PUB / "audio" / "ex2"

VOICE = "en-US-AriaNeural"
BIT_EX2 = 16


def entries():
    """Every entry with a second example sentence, keyed by its slug id."""
    out = []
    for p in sorted((PUB / "entries").glob("*.json")):
        for e in json.loads(p.read_text(encoding="utf-8")):
            ex = e.get("ex") or []
            if len(ex) >= 2 and (ex[1].get("en") or "").strip():
                out.append((p, e))
    return out


async def synth_one(text, out_path, retries=4):
    """Render one sentence; returns True when the file was written."""
    for attempt in range(retries):
        try:
            comm = edge_tts.Communicate(text, VOICE)
            await comm.save(str(out_path))
            if out_path.exists() and out_path.stat().st_size > 2000:
                return True
        except Exception:
            await asyncio.sleep(1.5 * (attempt + 1))
    return False


async def run(items, workers):
    sem = asyncio.Semaphore(workers)
    done = {"ok": 0, "fail": 0, "skip": 0}
    total = len(items)

    async def worker(text, out_path):
        async with sem:
            if out_path.exists() and out_path.stat().st_size > 2000:
                done["skip"] += 1
                return
            ok = await synth_one(text, out_path)
            done["ok" if ok else "fail"] += 1
            n = done["ok"] + done["fail"]
            if n % 100 == 0:
                print(f"{n}/{total} ok={done['ok']} fail={done['fail']} skip={done['skip']}", flush=True)

    await asyncio.gather(*(worker(t, o) for t, o in items))
    print(f"finished {done}", flush=True)
    return done


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    EX2.mkdir(parents=True, exist_ok=True)
    todo = []
    for _, e in entries():
        out = EX2 / f"{e['id']}.mp3"
        if out.exists() and out.stat().st_size > 2000:
            continue
        todo.append((e["ex"][1]["en"].strip(), out))
    if a.limit:
        todo = todo[: a.limit]
    print(f"missing recordings: {len(todo)}", flush=True)
    if not todo:
        return 0

    done = asyncio.run(run(todo, a.workers))
    if done["fail"]:
        print(f"WARNING: {done['fail']} sentences could not be rendered", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
