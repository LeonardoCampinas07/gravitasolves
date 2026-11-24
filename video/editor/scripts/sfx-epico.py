"""Trilha de fundo calma (livre de direitos) para o vídeo épico -> public/audio/epico-music.wav
Sem efeitos: só piano suave em arpejo + cama de pad quente, Lá menor -> Fá -> Dó -> Sol, ~76 BPM.
(A versão antiga, com impactos e batida, está em scripts/sfx-epico-impactos.bak.py.)"""
import json, wave
import numpy as np

SR = 44100
TL = json.load(open("src/epico/timeline.json", encoding="utf-8"))
TAIL = 2.4
DUR = TL["duration"] + TAIL
n = int(DUR * SR)
L = np.zeros(n); R = np.zeros(n)

def add(x, at, gain=1.0, pan=0.0):
    a = int(at * SR)
    if a >= n: return
    x = x[: n - a]
    L[a:a + len(x)] += x * gain * (1 - max(0, pan))
    R[a:a + len(x)] += x * gain * (1 + min(0, pan))

def piano(f, d=2.6):
    t = np.arange(int(d * SR)) / SR
    e = np.exp(-t * 1.8) * np.minimum(1, t / 0.01)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 2.5)
            + 0.08 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 4)) * e

beat = 60 / 76
bar = beat * 4
# acordes (fundamental grave + tríade) e arpejo em colcheias
prog = [
    (110.00, [220.00, 261.63, 329.63, 440.00]),  # Am
    (87.31,  [174.61, 220.00, 261.63, 349.23]),  # F
    (130.81, [196.00, 261.63, 329.63, 392.00]),  # C
    (98.00,  [196.00, 246.94, 293.66, 392.00]),  # G
]
pattern = [0, 1, 2, 3, 2, 1, 2, 3]
tb, k = 0.3, 0
while tb < DUR - 1:
    root, ch = prog[k % 4]
    # pad quente (sobe e desce devagar)
    t = np.arange(int(bar * 1.15 * SR)) / SR
    en = np.minimum(1, t / 0.9) * np.clip((bar * 1.15 - t) / 0.9, 0, 1)
    pad = sum(np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 1.003 * t) for f in ch[:3])
    add(pad * en, tb, 0.022, pan=0.15)
    add(piano(root, 3.5), tb, 0.16)
    for j, idx in enumerate(pattern):
        add(piano(ch[idx]), tb + j * beat / 2, 0.085, pan=-0.25 if j % 2 else 0.25)
    tb += bar; k += 1

# entrada e saída suaves
tt = np.arange(n) / SR
env = np.clip(tt / 2.5, 0, 1) * np.clip((DUR - tt) / 2.4, 0, 1)
L *= env; R *= env
peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak / 0.8; R /= peak / 0.8
with wave.open("public/audio/epico-music.wav", "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.stack([L, R], axis=1) * 32767).astype(np.int16).tobytes())
print(f"trilha calma {DUR:.1f}s")
