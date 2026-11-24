"""Trilha épica sintetizada (livre de direitos) sincronizada com src/epico/timeline.json -> public/audio/epico-music.wav
Antes da revelação: drone grave + batida de coração + notas soltas (tensão). Riser até o impacto no nome da marca.
Depois: impacto (boom + 'braam'), batida 120 BPM com baixo pulsado, e um último impacto no fechamento."""
import json, wave
import numpy as np

SR = 44100
rng = np.random.default_rng(11)
TL = json.load(open("src/epico/timeline.json", encoding="utf-8"))
P = TL["paragraphs"]
TAIL = 2.4
DUR = TL["duration"] + TAIL
n = int(DUR * SR)
L = np.zeros(n); R = np.zeros(n)

impact = next(w["start"] for w in P[2]["words"] if "gravita" in w["w"].lower())
outro = P[-1]["start"]

def add(x, at, gain=1.0, pan=0.0):
    a = int(at * SR)
    if a >= n: return
    x = x[: n - a]
    L[a:a + len(x)] += x * gain * (1 - max(0, pan))
    R[a:a + len(x)] += x * gain * (1 + min(0, pan))

def lp(x, k): return np.convolve(x, np.ones(k) / k, mode="same")
def env_exp(d, k): t = np.arange(int(d * SR)) / SR; return t, np.exp(-t * k)

# ── 1. Tensão (0 → impacto) ─────────────────────────────────────
tA = np.arange(int(impact * SR)) / SR
swell = np.clip(tA / 3, 0, 1) * (0.6 + 0.4 * tA / max(impact, 1))
drone = (np.sin(2 * np.pi * 55 * tA) + 0.6 * np.sin(2 * np.pi * 82.41 * tA + np.sin(tA * 0.7)) + 0.3 * np.sin(2 * np.pi * 110.2 * tA)) * swell * 0.10
add(drone, 0)
# batida de coração (lub-dub) a cada 1,1 s
def thump(f0=58, d=0.35):
    t, e = env_exp(d, 14); return np.sin(2 * np.pi * (f0 + 40 * np.exp(-t * 30)) * t) * e
hb = 1.0
while hb < impact - 3.2:
    add(thump(), hb, 0.55); add(thump(52), hb + 0.24, 0.35); hb += 1.1
# notas soltas (Lá menor), estilo piano triste
notes = [440, 523.25, 659.25, 587.33, 523.25, 440, 392, 440]
k, tn = 0, 0.6
while tn < impact - 3.5:
    t, e = env_exp(2.2, 2.2)
    f = notes[k % len(notes)]
    tone = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3)) * e * np.minimum(1, t / 0.005)
    add(tone, tn, 0.07, pan=0.3 if k % 2 else -0.3); k += 1; tn += 1.65
# riser: ruído filtrado subindo + glissando, termina 0,18 s antes do impacto (respiro)
rd = 3.4
t = np.arange(int(rd * SR)) / SR
noise = rng.standard_normal(len(t))
riser = np.zeros(len(t))
for j, k_ in enumerate([40, 20, 10, 5, 3]):
    seg = slice(int(len(t) * j / 5), int(len(t) * (j + 1) / 5)); riser[seg] = lp(noise, k_)[seg]
sweep = np.sin(2 * np.pi * np.cumsum(120 + 900 * (t / rd) ** 2) / SR) * 0.4
add((riser + sweep) * (t / rd) ** 2.2, impact - rd - 0.18, 0.35)

# ── 2. Impactos ─────────────────────────────────────────────────
def boom(scale=1.0):
    t, e = env_exp(3.2, 1.6)
    sub = np.sin(2 * np.pi * (38 + 70 * np.exp(-t * 8)) * t) * e
    crack = lp(rng.standard_normal(len(t)), 3) * np.exp(-t * 18)
    braam = sum(np.sign(np.sin(2 * np.pi * f * t)) * a for f, a in [(55, 1), (82.41, .7), (110, .6), (164.8, .3)])
    braam = lp(braam, 24) * np.exp(-t * 1.1) * np.minimum(1, t / 0.02)
    return (sub * 0.9 + crack * 0.5 + braam * 0.28) * scale
add(boom(), impact, 0.9)
add(boom(0.8), outro - 0.05, 0.7)

# ── 3. Batida 120 BPM depois do impacto ─────────────────────────
beat = 0.5
start = impact + 2.0
end_beat = DUR - 2.6
chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]]
roots = [55, 43.65, 65.41, 49]
def kick():
    t, e = env_exp(0.4, 9); return np.sin(2 * np.pi * (45 + 110 * np.exp(-t * 35)) * t) * e
def clap():
    t, e = env_exp(0.25, 22); return lp(rng.standard_normal(len(t)), 2) * e
def hat():
    t, e = env_exp(0.06, 70); x = rng.standard_normal(len(t)); return (x - lp(x, 4)) * e
b = 0
tb = start
while tb < end_beat:
    bar = b // 4
    c = (bar // 2) % 4
    ramp = min(1, (tb - start) / 6)  # entra crescendo
    if outro - 1.2 < tb < outro + 0.3: tb += beat; b += 1; continue  # respiro antes do último impacto
    add(kick(), tb, 0.55 * ramp)
    if b % 4 in (1, 3): add(clap(), tb, 0.22 * ramp)
    add(hat(), tb + beat / 2, 0.12 * ramp, pan=0.4); add(hat(), tb, 0.07 * ramp, pan=-0.4)
    for s in range(4):  # baixo em semicolcheias
        t, e = env_exp(beat / 4 * 0.95, 9)
        add(np.tanh(np.sin(2 * np.pi * roots[c] * 2 * t) * 2.2) * e, tb + s * beat / 4, 0.12 * ramp)
    if b % 8 == 0:  # cama de cordas por 2 compassos
        d = beat * 8
        t = np.arange(int(d * SR)) / SR
        en = np.minimum(1, t / 0.6) * np.clip((d - t) / 0.6, 0, 1)
        pad = sum(np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 5 * t)) + 0.5 * np.sin(2 * np.pi * f * 1.004 * t) for f in chords[c])
        add(pad * en, tb, 0.05 * ramp, pan=0.1)
    tb += beat; b += 1

# ── fim ─────────────────────────────────────────────────────────
fade = np.clip((DUR - np.arange(n) / SR) / 2.2, 0, 1)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak / 0.9; R /= peak / 0.9
st = np.stack([L, R], axis=1)
with wave.open("public/audio/epico-music.wav", "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype(np.int16).tobytes())
print(f"trilha {DUR:.1f}s · impacto {impact:.2f}s · fechamento {outro:.2f}s")
