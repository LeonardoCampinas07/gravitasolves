"""
Alinha a narração (um único arquivo) ao roteiro: encontra o início de cada parágrafo pelas pausas
do áudio e estima o tempo de cada palavra. Gera src/timeline.json usado pelo vídeo.

Uso: python scripts/align.py public/audio/narracao.mp3 [roteiro.txt] [saida.json]
"""
import json, re, subprocess, sys

audio = sys.argv[1]
SCRIPT = sys.argv[2] if len(sys.argv) > 2 else "scripts/script.txt"
OUTFILE = sys.argv[3] if len(sys.argv) > 3 else "src/timeline.json"
paras = [p.strip() for p in open(SCRIPT, encoding="utf-8").read().split("\n\n") if p.strip()]

dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audio],
                           capture_output=True, text=True).stdout)

def silences(noise="-34dB", d="0.18"):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", audio, "-af", f"silencedetect=noise={noise}:d={d}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    return [(s, e) for s, e in zip(starts, ends)]

sil = silences()
# Fala começa no fim do primeiro silêncio inicial (se houver) e termina no início do silêncio final.
speech_start = sil[0][1] if sil and sil[0][0] < 0.05 else 0.0
speech_end = sil[-1][0] if sil and abs(sil[-1][1] - dur) < 0.3 else dur
inner = [(s, e) for s, e in sil if s > speech_start + 0.2 and e < speech_end - 0.2]

def snap(expected, candidates, used, window):
    """Escolhe a pausa mais longa perto do ponto esperado."""
    best, score = None, -1
    for i, (s, e) in enumerate(candidates):
        if i in used: continue
        mid = (s + e) / 2
        if abs(mid - expected) > window: continue
        sc = (e - s) - abs(mid - expected) * 0.05
        if sc > score: best, score = i, sc
    return best

# 1) Fronteiras entre parágrafos
weights = [len(p) for p in paras]
total = sum(weights)
bounds, acc, used = [], 0, set()
for k in range(len(paras) - 1):
    acc += weights[k]
    expected = speech_start + (speech_end - speech_start) * acc / total
    i = snap(expected, inner, used, window=(speech_end - speech_start) * 0.08)
    if i is None: bounds.append((expected, expected))
    else: used.add(i); bounds.append(inner[i])
bounds.sort()

segs = []
for k, p in enumerate(paras):
    a = speech_start if k == 0 else bounds[k - 1][1]
    b = speech_end if k == len(paras) - 1 else bounds[k][0]
    segs.append((a, b))

# 2) Palavras: sentenças ancoradas nas pausas internas; palavras proporcionais ao tamanho
out = []
for k, (p, (a, b)) in enumerate(zip(paras, segs)):
    sentences = [s for s in re.split(r"(?<=[.!?…:])\s+", p) if s]
    sw = [len(s) for s in sentences]
    cand = [(s, e) for s, e in inner if a < s and e < b]
    cuts, acc2, used2 = [], 0, set()
    for j in range(len(sentences) - 1):
        acc2 += sw[j]
        exp = a + (b - a) * acc2 / sum(sw)
        i = snap(exp, cand, used2, window=(b - a) * 0.15)
        if i is None: cuts.append((exp, exp))
        else: used2.add(i); cuts.append(cand[i])
    cuts.sort()
    words = []
    for j, s in enumerate(sentences):
        sa = a if j == 0 else cuts[j - 1][1]
        sb = b if j == len(sentences) - 1 else cuts[j][0]
        toks = s.split()
        lens = [len(t) + 2 for t in toks]
        t = sa
        for tok, ln in zip(toks, lens):
            d = (sb - sa) * ln / sum(lens)
            words.append({"w": tok, "start": round(t, 3), "end": round(t + d, 3)})
            t += d
    out.append({"start": round(a, 3), "end": round(b, 3), "text": p, "words": words})

json.dump({"audio": audio.replace("public/", ""), "duration": round(dur, 3), "paragraphs": out},
          open(OUTFILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"duração {dur:.1f}s · fala {speech_start:.2f}–{speech_end:.2f}s")
for k, s in enumerate(out):
    print(f"{k + 1:02d} {s['start']:6.2f}–{s['end']:6.2f}  {s['text'][:50]}")
