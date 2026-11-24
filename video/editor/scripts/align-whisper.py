"""
Alinhamento preciso: transcreve a narração localmente (faster-whisper, com tempo por palavra) e casa cada
palavra do roteiro com a palavra falada. Gera o mesmo formato de timeline que align.py.

Uso: python scripts/align-whisper.py public/audio/narracao-epico.mp3 scripts/script-epico.txt src/epico/timeline.json
"""
import difflib, json, re, subprocess, sys, unicodedata
from faster_whisper import WhisperModel

audio, script, outfile = sys.argv[1], sys.argv[2], sys.argv[3]
paras = [p.strip() for p in open(script, encoding="utf-8").read().split("\n\n") if p.strip()]
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio],
                           capture_output=True, text=True).stdout)

def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", w)

import numpy as np
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", audio, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
wave = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0
model = WhisperModel("small", device="cpu", compute_type="int8")
segs, _ = model.transcribe(wave, language="pt", word_timestamps=True, vad_filter=False,
                           initial_prompt="GravitaSolves, LGPD, barbearia.")
heard = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
# "GravitaSolves" pode vir como "Gravita Solves": junta para casar com o roteiro
hn = []
for w, a, b in heard:
    n = norm(w)
    if hn and hn[-1][0] == "gravita" and n.startswith("solv"):
        hn[-1] = ("gravitasolves", hn[-1][1], b); continue
    if n: hn.append((n, a, b))

script_words = [(k, tok) for k, p in enumerate(paras) for tok in p.split()]
sn = [norm(t) for _, t in script_words]
times = [None] * len(sn)
sm = difflib.SequenceMatcher(a=sn, b=[h[0] for h in hn], autojunk=False)
for blk in sm.get_matching_blocks():
    for i in range(blk.size):
        times[blk.a + i] = (hn[blk.b + i][1], hn[blk.b + i][2])
matched = sum(t is not None for t in times)
# preenche palavras não casadas interpolando entre vizinhas
for i in range(len(times)):
    if times[i] is None:
        prev = next((times[j][1] for j in range(i - 1, -1, -1) if times[j]), 0.0)
        nj = next((j for j in range(i + 1, len(times)) if times[j]), None)
        nxt = times[nj][0] if nj is not None else dur
        gap = (nj - i + 1) if nj is not None else (len(times) - i + 1)
        step = max(0.05, (nxt - prev) / gap)
        times[i] = (prev, prev + step)
        times[i] = (prev + 0.0, min(nxt, prev + step))

out = []
for k, p in enumerate(paras):
    idx = [i for i, (pk, _) in enumerate(script_words) if pk == k]
    words = [{"w": script_words[i][1], "start": round(times[i][0], 3), "end": round(times[i][1], 3)} for i in idx]
    out.append({"start": words[0]["start"], "end": words[-1]["end"], "text": p, "words": words})

json.dump({"audio": audio.replace("public/", ""), "duration": round(dur, 3), "paragraphs": out},
          open(outfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"duração {dur:.1f}s · palavras casadas {matched}/{len(sn)}")
for k, s in enumerate(out):
    print(f"{k + 1:02d} {s['start']:6.2f}–{s['end']:6.2f}  {s['text'][:50]}")
