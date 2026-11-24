"""Insere PAD s de silêncio entre "GravitaSolves." (parágrafo 3) e o parágrafo 4 e desloca a timeline."""
import json, subprocess, sys
src, PAD = sys.argv[1], 2.0
t = json.load(open("src/epico/timeline-orig.json", encoding="utf-8"))
P = t["paragraphs"]
CUT = round((P[2]["end"] + P[3]["start"]) / 2, 3)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex",
    f"[0:a]atrim=0:{CUT},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono[a];"
    f"[0:a]atrim={CUT},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono[b];"
    f"aevalsrc=0:d={PAD}:s=44100:c=mono[s];[a][s][b]concat=n=3:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-b:a", "192k", "public/audio/narracao-epico.mp3"], check=True)
for p in P:
    for w in p["words"]:
        if w["start"] >= CUT: w["start"] = round(w["start"] + PAD, 3); w["end"] = round(w["end"] + PAD, 3)
    p["start"], p["end"] = p["words"][0]["start"], p["words"][-1]["end"]
t["audio"] = "audio/narracao-epico.mp3"; t["duration"] = round(t["duration"] + PAD, 3)
json.dump(t, open("src/epico/timeline.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"pausa de {PAD}s inserida em {CUT}s")
