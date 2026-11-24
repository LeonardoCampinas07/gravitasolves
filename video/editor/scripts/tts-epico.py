"""Narração PROVISÓRIA (edge-tts) só para pré-visualizar o vídeo épico. A final vem do ElevenLabs."""
import asyncio, subprocess, os, edge_tts
paras = [p.strip() for p in open("scripts/script-epico.txt", encoding="utf-8").read().split("\n\n") if p.strip()]
os.makedirs("out-tts", exist_ok=True)
async def main():
    for i, p in enumerate(paras):
        txt = p.replace("GravitaSolves", "Gravita Solves")
        await edge_tts.Communicate(txt, "pt-BR-AntonioNeural", rate="-4%").save(f"out-tts/p{i:02d}.mp3")
asyncio.run(main())
gap = [0.9, 1.0, 2.6] + [0.8] * 20  # pausa longa depois da marca (no ElevenLabs: <break time="2.0s" />)
with open("out-tts/list.txt", "w") as f:
    f.write("file 'sil_lead.wav'\n")
    for i in range(len(paras)):
        f.write(f"file 'p{i:02d}.wav'\n")
        if i < len(paras) - 1: f.write(f"file 'sil{i:02d}.wav'\n")
    f.write("file 'sil_tail.wav'\n")
def sil(name, d): subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(d), f"out-tts/{name}.wav"], check=True)
sil("sil_lead", 0.4); sil("sil_tail", 0.6)
for i in range(len(paras)):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", f"out-tts/p{i:02d}.mp3", "-ar", "44100", "-ac", "1", f"out-tts/p{i:02d}.wav"], check=True)
    sil(f"sil{i:02d}", gap[i])
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "out-tts/list.txt", "-b:a", "160k", "public/audio/narracao-epico-provisoria.mp3"], check=True)
print("ok")
