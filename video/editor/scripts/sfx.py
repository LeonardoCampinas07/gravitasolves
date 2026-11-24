"""Gera trilha musical e efeitos sonoros (sintetizados, livres de direitos): music.wav, whoosh.wav, click.wav, pop.wav."""
import wave
import numpy as np

SR = 44100
rng = np.random.default_rng(7)

def save(name, x):
    x = np.clip(x, -1, 1)
    st = np.stack([x, x], axis=1) if x.ndim == 1 else x
    with wave.open(f"public/audio/{name}", "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())

def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")

# ── Trilha: 104 BPM, Am – F – C – G, pad + baixo + bumbo suave + chimbal ──
BPM = 104
beat = 60 / BPM
bars = 72  # ~ 2min46s
n = int(bars * 4 * beat * SR)
t = np.arange(n) / SR
mix = np.zeros(n)
chords = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [261.63, 329.63, 392.0], [196.0, 246.94, 293.66]]
roots = [110.0, 87.31, 130.81, 98.0]
bar_len = 4 * beat
for b in range(bars):
    c = (b // 2) % 4
    a, e = int(b * bar_len * SR), int(min((b + 1) * bar_len, n / SR) * SR)
    tt = t[a:e] - b * bar_len
    env = np.minimum(1, tt / 0.25) * np.clip((bar_len + 0.3 - tt) / 0.5, 0, 1)
    pad = sum(np.sin(2 * np.pi * f * tt + np.sin(2 * np.pi * 0.3 * tt) * 0.4) * 0.5 + np.sin(2 * np.pi * f * 1.005 * tt) * 0.3 for f in chords[c])
    mix[a:e] += pad * env * 0.10
    # baixo pulsado em colcheias
    for k in range(8):
        s = a + int(k * beat / 2 * SR); L = int(beat / 2 * 0.9 * SR)
        if s + L > n: break
        tb = np.arange(L) / SR
        mix[s:s + L] += np.sin(2 * np.pi * roots[c] * tb) * np.exp(-tb * 6) * 0.22
    # bumbo nos tempos 1 e 3, chimbal nas colcheias
    if b >= 4:
        for k in range(4):
            s = a + int(k * beat * SR)
            if k in (0, 2):
                L = int(0.35 * SR); tb = np.arange(L) / SR
                f = 50 + 90 * np.exp(-tb * 30)
                if s + L <= n: mix[s:s + L] += np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tb * 9) * 0.45
            for h in (0, 0.5):
                s2 = a + int((k + h) * beat * SR); L = int(0.05 * SR)
                if s2 + L <= n:
                    noise = rng.standard_normal(L)
                    hp = noise - lowpass(noise, 6)
                    mix[s2:s2 + L] += hp * np.exp(-np.arange(L) / SR * 80) * (0.05 if h else 0.07)
mix = mix / np.max(np.abs(mix)) * 0.8
fade = int(3 * SR); mix[:fade] *= np.linspace(0, 1, fade); mix[-fade:] *= np.linspace(1, 0, fade)
save("music.wav", mix)

# ── Whoosh: ruído filtrado com varredura ──
L = int(0.7 * SR); tw = np.arange(L) / SR
noise = rng.standard_normal(L)
env = np.sin(np.pi * np.clip(tw / 0.7, 0, 1)) ** 2
k = (np.linspace(40, 4, L)).astype(int)
out = np.zeros(L)
cs = np.cumsum(np.insert(noise, 0, 0))
for i in range(L):
    a = max(0, i - k[i]); out[i] = (cs[i + 1] - cs[a]) / (i + 1 - a)
save("whoosh.wav", out / np.max(np.abs(out)) * env * 0.6)

# ── Clique de mouse ──
L = int(0.06 * SR); tc = np.arange(L) / SR
click = (rng.standard_normal(L) * np.exp(-tc * 220) * 0.6 + np.sin(2 * np.pi * 2200 * tc) * np.exp(-tc * 160) * 0.4)
save("click.wav", click * 0.7)

# ── Pop (entrada de destaques) ──
L = int(0.18 * SR); tp = np.arange(L) / SR
f = 500 + 900 * np.exp(-tp * 25)
pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tp * 22)
save("pop.wav", pop * 0.5)
print("ok")
