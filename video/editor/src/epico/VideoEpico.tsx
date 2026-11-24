import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, Sequence, continueRender, delayRender, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import timeline from "./timeline.json";
import meta from "../../public/shots-epico/meta.json";
import { SCENES, type Beat, type Cam, type EpicScene as SceneDef } from "./scenes";

const FPS = 30;
const TAIL = 2.4; // segundos após o fim da fala
export const totalFramesEpico = Math.ceil((timeline.duration + TAIL) * FPS);

const C = { ink: "#0a0f0d", ink2: "#111814", paper: "#f6f7f4", citrus: "#d4f06a", brand: "#12a37a", violet: "#6e56cf", line: "#e4e7e1" };
type Rect = { x: number; y: number; w: number; h: number };
const SHOTS = meta.shots as Record<string, Record<string, Rect | null>>;
const VW = meta.viewport.w, VH = meta.viewport.h;
const ease = Easing.bezier(0.65, 0, 0.35, 1);
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

// ── Fontes da marca ────────────────────────────────────────────
const fontHandle = delayRender("fonts-epico");
Promise.all([
  new FontFace("Geist", `url(${staticFile("Geist-Variable.woff2")})`, { weight: "100 900" }).load(),
  new FontFace("GeistMono", `url(${staticFile("GeistMono-Variable.woff2")})`, { weight: "100 900" }).load(),
]).then((fs) => { fs.forEach((f) => document.fonts.add(f)); continueRender(fontHandle); });

// ── Tempos ─────────────────────────────────────────────────────
const P = timeline.paragraphs;
// a revelação (cena 3) segura até perto da próxima fala, para a marca respirar
const sceneStart = (i: number) => (i === 0 ? 0 : i === 3 ? P[3].start - 0.45 : (P[i - 1].end + P[i].start) / 2);
const sceneEnd = (i: number) => (i === P.length - 1 ? timeline.duration + TAIL : i === 2 ? sceneStart(3) : (P[i].end + P[i + 1].start) / 2);
const OVER = 0.3; // sobreposição das transições (s)

export const VideoEpico: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const speaking = P.some((p) => t >= p.start - 0.1 && t <= p.end + 0.1);
  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: "Geist, sans-serif" }}>
      <Backdrop />
      {SCENES.map((s, i) => {
        const a = Math.max(0, sceneStart(i) - OVER), b = sceneEnd(i) + (i === SCENES.length - 1 ? 0 : OVER);
        return (
          <Sequence key={i} from={Math.round(a * FPS)} durationInFrames={Math.round((b - a) * FPS)} name={`Cena ${i + 1}`}>
            <SceneShell def={s} index={i} start={sceneStart(i)} end={sceneEnd(i)} seqStart={a} seqEnd={b} />
          </Sequence>
        );
      })}
      <Captions />
      <Audio src={staticFile(timeline.audio)} />
      <Audio src={staticFile("audio/epico-music.wav")} volume={(f) => {
        const tt = f / FPS;
        const fadeOut = interpolate(tt, [timeline.duration + TAIL - 2, timeline.duration + TAIL], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const talking = P.some((p) => tt >= p.start - 0.2 && tt <= p.end + 0.2);
        return (talking ? 0.05 : 0.09) * fadeOut;
      }} />
      {void speaking}
    </AbsoluteFill>
  );
};

// ── Fundo: degradê escuro + órbitas sutis ─────────────────────
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 78% 18%, rgba(18,163,122,.18), transparent 60%), radial-gradient(900px 600px at 10% 100%, rgba(212,240,106,.08), transparent 60%), ${C.ink}` }}>
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
        {[260, 420, 600, 820].map((r, i) => (
          <circle key={r} cx={1500} cy={260} r={r} fill="none" stroke={C.citrus} strokeOpacity={0.05 + i * 0.015}
            strokeDasharray={i % 2 ? "2 10" : undefined} transform={`rotate(${frame * (i % 2 ? 0.05 : -0.03)} 1500 260)`} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// ── Moldura de cena: entrada/saída com movimento ──────────────
const SceneShell: React.FC<{ def: SceneDef; index: number; start: number; end: number; seqStart: number; seqEnd: number }> = ({ def, index, start, end, seqStart, seqEnd }) => {
  const frame = useCurrentFrame();
  const t = seqStart + frame / FPS;
  const inP = interpolate(t, [seqStart, seqStart + OVER * 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const outP = seqEnd > end ? interpolate(t, [seqEnd - OVER * 2, seqEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }) : 0;
  const style: React.CSSProperties = {
    opacity: inP * (1 - outP),
    transform: `scale(${1.06 - 0.06 * inP - 0.04 * outP}) translateY(${(1 - inP) * 30}px)`,
    filter: `blur(${(1 - inP) * 14 + outP * 10}px)`,
  };
  const local = (t - start) / (end - start); // 0..1 dentro da cena
  return (
    <AbsoluteFill style={style}>
      {def.kind === "hook" && <Hook t={t} p={P[index]} highlight={def.highlight} />}
      {def.kind === "pain" && <Pain t={t} p={P[index]} highlight={def.highlight} />}
      {def.kind === "reveal" && <Reveal t={t} p={P[index]} />}
      {def.kind === "ui" && <UiScene t={t} local={local} def={def} start={start} end={end} />}
      {def.kind === "outro" && <Outro t={t} start={start} p={P[P.length - 1]} />}
    </AbsoluteFill>
  );
};

// ── Texto cinético palavra a palavra ──────────────────────────
type Word = { w: string; start: number; end: number };
const KineticLine: React.FC<{ words: Word[]; t: number; size: number; highlight?: string[]; align?: "center" | "left" }> = ({ words, t, size, highlight = [], align = "center" }) => (
  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", gap: `0 ${size * 0.26}px`, maxWidth: 1500, lineHeight: 1.08 }}>
    {words.map((w, i) => {
      const p = interpolate(t, [w.start - 0.08, w.start + 0.22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
      const hl = highlight.some((h) => w.w.toLowerCase().includes(h));
      return (
        <span key={i} style={{ fontSize: size, fontWeight: 650, letterSpacing: "-0.04em", color: hl ? C.citrus : "#fff", opacity: p, transform: `translateY(${(1 - p) * size * 0.35}px)`, filter: `blur(${(1 - p) * 8}px)`, display: "inline-block" }}>{w.w}</span>
      );
    })}
  </div>
);

function sentencesOf(words: Word[]) {
  const out: Word[][] = [[]];
  words.forEach((w) => { out[out.length - 1].push(w); if (/[.!?…:]$/.test(w.w)) out.push([]); });
  return out.filter((s) => s.length);
}

// ── Órbita de "clientes" (pontos que saem e voltam) ───────────
const OrbitDots: React.FC<{ t: number; leave: number; back: number; cx?: number; cy?: number }> = ({ t, leave, back, cx = 960, cy = 540 }) => (
  <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
    <circle cx={cx} cy={cy} r={300} fill="none" stroke={C.citrus} strokeOpacity={0.12} />
    <circle cx={cx} cy={cy} r={420} fill="none" stroke={C.citrus} strokeOpacity={0.06} strokeDasharray="2 10" />
    {Array.from({ length: 28 }).map((_, i) => {
      const ang = (i / 28) * Math.PI * 2 + t * 0.25;
      const drifting = i % 3 === 0;
      const away = drifting ? Math.max(0, leave - back) : 0;
      const r = 300 + away * (260 + (i % 5) * 60);
      const op = drifting ? 1 - away * 0.85 : 1;
      return <circle key={i} cx={cx + Math.cos(ang) * r} cy={cy + Math.sin(ang) * r} r={drifting ? 7 : 5} fill={drifting && away > 0.05 ? "#e8692a" : C.citrus} opacity={op * 0.9} />;
    })}
  </svg>
);

const Hook: React.FC<{ t: number; p: (typeof P)[number]; highlight: string[] }> = ({ t, p, highlight }) => {
  const sents = sentencesOf(p.words);
  const cur = sents.findIndex((s, i) => t < (sents[i + 1]?.[0].start ?? 1e9));
  const leave = interpolate(t, [p.start + 1, p.end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.5 }}><OrbitDots t={t} leave={leave} back={0} /></div>
      <div style={{ position: "relative", padding: "0 160px" }}>
        {sents.map((s, i) => i === cur && <KineticLine key={i} words={s} t={t} size={i === 0 ? 96 : 104} highlight={highlight} />)}
      </div>
    </AbsoluteFill>
  );
};

const Logo: React.FC<{ size: number; draw: number }> = ({ size, draw }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M26.39 10A12 12 0 1 1 22 5.61" stroke={C.citrus} strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - draw} />
    <circle cx="26.4" cy="10" r={3.2 * Math.min(1, draw * 1.3)} fill={C.citrus} />
    <circle cx="16" cy="16" r={5 * Math.min(1, draw * 2)} fill="#fff" />
  </svg>
);

const Outro: React.FC<{ t: number; start: number; p: (typeof P)[number] }> = ({ t, start, p }) => {
  const draw = interpolate(t, [start + 0.1, start + 1.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const back = interpolate(t, [start, start + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ctaIdx = p.words.findIndex((w) => w.w.toLowerCase().startsWith("crie"));
  const cta = interpolate(t, [(p.words[ctaIdx]?.start ?? p.end) - 0.1, (p.words[ctaIdx]?.start ?? p.end) + 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const tagline = p.words.slice(1, ctaIdx > 0 ? ctaIdx : undefined);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.45 }}><OrbitDots t={t} leave={1} back={back} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, position: "relative" }}>
        <Logo size={104} draw={draw} />
        <Wordmark size={92} opacity={draw} />
      </div>
      <div style={{ position: "relative", marginTop: 36 }}><KineticLine words={tagline} t={t} size={58} highlight={["volta", "conhece"]} /></div>
      <div style={{ position: "relative", marginTop: 46, opacity: cta, transform: `scale(${0.9 + cta * 0.1})`, background: C.citrus, color: C.ink, fontWeight: 650, fontSize: 34, padding: "20px 40px", borderRadius: 18, boxShadow: "0 20px 60px -20px rgba(212,240,106,.6)" }}>
        Crie sua conta hoje
      </div>
      <div style={{ position: "relative", marginTop: 22, opacity: cta * 0.85, fontSize: 26, color: "rgba(255,255,255,.75)" }}>ou teste a simulação · sem cadastro</div>
    </AbsoluteFill>
  );
};

// ── Cenas de interface ────────────────────────────────────────
const UiScene: React.FC<{ t: number; local: number; def: Extract<SceneDef, { kind: "ui" }>; start: number; end: number }> = ({ t, local, def, start, end }) => {
  const beats = def.beats;
  const titleDur = def.title ? Math.min(1.5, (end - start) * 0.22) : 0;
  const titleP = def.title ? interpolate(t, [start, start + 0.35, start + titleDur, start + titleDur + 0.45], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return (
    <AbsoluteFill>
      {beats.map((b, i) => {
        const a = b.at, z = beats[i + 1]?.at ?? 1;
        const fadeIn = i === 0 ? 1 : interpolate(local, [a - 0.03, a + 0.05], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
        const visible = local >= a - 0.04 && local <= z + 0.06;
        if (!visible) return null;
        const prog = interpolate(local, [a, z], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <AbsoluteFill key={i} style={{ opacity: fadeIn, transform: `scale(${1.03 - 0.03 * fadeIn})` }}>
            <ShotWindow beat={b} progress={prog} t={t} blur={titleP * 16} dim={titleP * 0.55} />
          </AbsoluteFill>
        );
      })}
      {def.title && titleP > 0 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: titleP }}>
          <div style={{ textAlign: "center", transform: `translateY(${(1 - titleP) * 24}px) scale(${0.96 + titleP * 0.04})` }}>
            {def.eyebrow && <div style={{ display: "inline-block", fontSize: 24, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ink, background: C.citrus, padding: "8px 18px", borderRadius: 999 }}>{def.eyebrow}</div>}
            <div style={{ marginTop: 22, fontSize: 104, fontWeight: 650, letterSpacing: "-0.045em", color: "#fff", textShadow: "0 10px 40px rgba(0,0,0,.45)" }}>{def.title}</div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ── Janela do navegador com câmera, cursor e destaques ────────
const WIN = { x: 150, y: 70, w: 1620, h: Math.round(1620 * VH / VW) + 46 };
const BAR = 46;
const CW = WIN.w, CH = WIN.h - BAR, K = CW / VW;

function camAt(beat: Beat, p: number) {
  const keys = beat.cam;
  const R = SHOTS[beat.shot] ?? {};
  const pt = (c: Cam) => {
    const r = c.target ? R[c.target] : null;
    return { x: r ? r.x + r.w / 2 : VW / 2, y: (r ? r.y + r.h / 2 : VH / 2) + (c.dy ?? 0), z: c.zoom };
  };
  if (p <= keys[0].t) return pt(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (p <= b.t) {
      const e = ease((p - a.t) / Math.max(0.0001, b.t - a.t));
      const A = pt(a), B = pt(b);
      return { x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e, z: A.z + (B.z - A.z) * e };
    }
  }
  return pt(keys[keys.length - 1]);
}

function project(cam: { x: number; y: number; z: number }) {
  const s = K * cam.z;
  let tx = CW / 2 - cam.x * s, ty = CH / 2 - cam.y * s;
  tx = Math.min(0, Math.max(CW - VW * s, tx));
  ty = Math.min(0, Math.max(CH - VH * s, ty));
  return { s, tx, ty, map: (x: number, y: number) => ({ x: tx + x * s, y: ty + y * s }) };
}

const ShotWindow: React.FC<{ beat: Beat; progress: number; t: number; blur?: number; dim?: number }> = ({ beat, progress, t, blur = 0, dim = 0 }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const cam = camAt(beat, progress);
  const pr = project(cam);
  const R = SHOTS[beat.shot] ?? {};
  // leve "respiração" da janela inteira
  const drift = Math.sin(t * 0.6) * 4;
  return (
    <div style={{ position: "absolute", left: WIN.x, top: WIN.y + drift, width: WIN.w, height: WIN.h, borderRadius: 18, overflow: "hidden", background: "#0a0f0d", boxShadow: "0 60px 160px -30px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10), 0 0 120px -40px rgba(18,163,122,.45)", filter: blur ? `blur(${blur}px)` : undefined }}>
      <div style={{ height: BAR, background: "#111814", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", padding: "0 18px", gap: 8 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <span key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />)}
        <div style={{ margin: "0 auto", width: 520, height: 28, borderRadius: 8, background: "#0a0f0d", border: "1px solid rgba(255,255,255,.08)", fontSize: 15, color: "rgba(255,255,255,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Geist" }}>gravitasolves</div>
      </div>
      <div style={{ position: "relative", width: CW, height: CH, overflow: "hidden" }}>
        <Img src={staticFile(`shots-epico/${beat.shot}.png`)} style={{ position: "absolute", left: pr.tx, top: pr.ty, width: VW * pr.s, height: VH * pr.s }} />
        {beat.callouts?.map((c, i) => <CalloutPill key={i} c={c} R={R} pr={pr} progress={progress} fps={fps} frame={frame} />)}
        {beat.cursor && <CursorLayer beat={beat} progress={progress} pr={pr} />}
        {dim > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(10,15,13,${dim})` }} />}
      </div>
    </div>
  );
};

const CalloutPill: React.FC<{ c: NonNullable<Beat["callouts"]>[number]; R: Record<string, Rect | null>; pr: ReturnType<typeof project>; progress: number; fps: number; frame: number }> = ({ c, R, pr, progress }) => {
  const r = R[c.target];
  if (!r) return null;
  const p = interpolate(progress, [c.t, c.t + 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  if (p <= 0) return null;
  const tl = pr.map(r.x, r.y), br = pr.map(r.x + r.w, r.y + r.h);
  const side = c.side ?? "bottom";
  let left = (tl.x + br.x) / 2, top = br.y + 18, tx = "-50%", ty = "0";
  if (side === "top") { top = tl.y - 18; ty = "-100%"; }
  if (side === "right") { left = br.x + 22; top = (tl.y + br.y) / 2; tx = "0"; ty = "-50%"; }
  if (side === "left") { left = tl.x - 22; top = (tl.y + br.y) / 2; tx = "-100%"; ty = "-50%"; }
  left = Math.max(30, Math.min(CW - 30, left)); top = Math.max(30, Math.min(CH - 30, top));
  return (
    <>
      <div style={{ position: "absolute", left: tl.x - 8, top: tl.y - 8, width: br.x - tl.x + 16, height: br.y - tl.y + 16, borderRadius: 14, border: `3px solid ${C.citrus}`, boxShadow: "0 0 0 6px rgba(212,240,106,.25)", opacity: p, transform: `scale(${0.96 + p * 0.04})` }} />
      <div style={{ position: "absolute", left, top, transform: `translate(${tx}, ${ty}) scale(${0.85 + p * 0.15})`, opacity: p, background: C.citrus, color: C.ink, padding: "14px 22px", borderRadius: 14, fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", boxShadow: "0 18px 50px -14px rgba(0,0,0,.55)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 12, height: 12, borderRadius: 99, background: C.ink }} />{c.text}
      </div>
    </>
  );
};

const CursorLayer: React.FC<{ beat: Beat; progress: number; pr: ReturnType<typeof project> }> = ({ beat, progress, pr }) => {
  const keys = beat.cursor!;
  const R = SHOTS[beat.shot] ?? {};
  const pos = (k: (typeof keys)[number]) => { const r = R[k.target]; return r ? { x: r.x + Math.min(r.w / 2, 70), y: r.y + r.h / 2 } : { x: VW / 2, y: VH / 2 }; };
  const startP = { x: VW * 0.62, y: VH * 0.78 };
  let x = startP.x, y = startP.y;
  let prevT = 0, prev = startP;
  for (const k of keys) {
    const target = pos(k);
    if (progress <= k.t) {
      const e = ease(Math.max(0, Math.min(1, (progress - prevT) / Math.max(0.0001, k.t - prevT))));
      x = prev.x + (target.x - prev.x) * e; y = prev.y + (target.y - prev.y) * e;
      break;
    }
    x = target.x; y = target.y; prevT = k.t; prev = target;
  }
  const appear = interpolate(progress, [0, 0.06], [0, 1], { extrapolateRight: "clamp" });
  const p = pr.map(x, y);
  const clicks = keys.filter((k) => k.click);
  return (
    <>
      {clicks.map((k, i) => {
        const cp = interpolate(progress, [k.t, k.t + 0.07], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (cp <= 0 || cp >= 1) return null;
        const c = pr.map(pos(k).x, pos(k).y);
        return <div key={i} style={{ position: "absolute", left: c.x - 34, top: c.y - 34, width: 68, height: 68, borderRadius: 99, background: "rgba(212,240,106,.55)", transform: `scale(${0.3 + cp * 1.4})`, opacity: 1 - cp }} />;
      })}
      <svg width="40" height="40" viewBox="0 0 24 24" style={{ position: "absolute", left: p.x - 6, top: p.y - 4, opacity: appear, filter: "drop-shadow(0 4px 6px rgba(0,0,0,.35))" }}>
        <path d="M4 2l15 11.5-6.6.9 3.9 7.5-2.9 1.5-3.9-7.6L4 20z" fill="#fff" stroke={C.ink} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </>
  );
};

// ── Legendas: frase curta, palavra atual em destaque ──────────
const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const pi = P.findIndex((p) => t >= p.start - 0.15 && t <= p.end + 0.35);
  if (pi <= 2 || pi === P.length - 1) return null; // gancho, apresentação e fechamento já têm texto em tela
  const words = P[pi].words;
  // agrupa em blocos de até 6 palavras, quebrando em pontuação
  const chunks: Word[][] = [[]];
  words.forEach((w) => { const c = chunks[chunks.length - 1]; c.push(w); if (c.length >= 6 || /[.!?…:,]$/.test(w.w) && c.length >= 3) chunks.push([]); });
  const list = chunks.filter((c) => c.length);
  const ci = Math.max(0, list.findIndex((c, i) => t < (list[i + 1]?.[0].start ?? 1e9)));
  const chunk = list[ci];
  const enter = interpolate(t, [chunk[0].start - 0.12, chunk[0].start + 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 46 }}>
      <div style={{ display: "flex", gap: "0 14px", flexWrap: "wrap", justifyContent: "center", maxWidth: 1400, background: "rgba(10,15,13,.86)", padding: "16px 30px", borderRadius: 20, boxShadow: "0 20px 60px -20px rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.08)", opacity: enter, transform: `translateY(${(1 - enter) * 12}px)` }}>
        {chunk.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          const said = t >= w.start;
          return <span key={i} style={{ fontSize: 42, fontWeight: 650, letterSpacing: "-0.015em", color: active ? C.ink : said ? "#fff" : "rgba(255,255,255,.45)", background: active ? C.citrus : "transparent", borderRadius: 8, padding: "0 6px", margin: "0 -6px" }}>{w.w}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── Marca: gravita + solves ───────────────────────────────────
const Wordmark: React.FC<{ size: number; opacity?: number }> = ({ size, opacity = 1 }) => (
  <span style={{ fontSize: size, fontWeight: 650, letterSpacing: "-0.05em", color: "#fff", opacity }}>gravita<span style={{ color: C.citrus }}>solves</span></span>
);

// ── Dor: clientes indo embora ─────────────────────────────────
const Pain: React.FC<{ t: number; p: (typeof P)[number]; highlight: string[] }> = ({ t, p, highlight }) => {
  const sents = sentencesOf(p.words);
  const cur = sents.findIndex((s, i) => t < (sents[i + 1]?.[0].start ?? 1e9));
  const leave = interpolate(t, [p.start, p.end], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const last = cur === sents.length - 1;
  const mult = last ? interpolate(t, [sents[cur][0].start, sents[cur][0].start + 1.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut }) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(900px 600px at 50% 50%, rgba(232,105,42,.16), transparent 70%)", opacity: leave }} />
      <div style={{ position: "absolute", inset: 0, opacity: 0.55 }}><OrbitDots t={t} leave={leave} back={0} /></div>
      {[0, 1, 2].map((k) => (
        <div key={k} style={{ position: "absolute", inset: 0, opacity: mult * 0.35, transform: `scale(${0.55 + k * 0.5}) rotate(${k * 40}deg)` }}><OrbitDots t={t + k} leave={leave} back={0} /></div>
      ))}
      <div style={{ position: "relative", padding: "0 160px" }}>
        {sents.map((s, i) => i === cur && <KineticLine key={i} words={s} t={t} size={i >= 3 ? 96 : 118} highlight={highlight} />)}
      </div>
    </AbsoluteFill>
  );
};

// ── Revelação: a sua solução chegou ───────────────────────────
const Reveal: React.FC<{ t: number; p: (typeof P)[number] }> = ({ t, p }) => {
  const frame = useCurrentFrame();
  const sents = sentencesOf(p.words);
  const hit = p.words.find((w) => w.w.toLowerCase().includes("gravita"))?.start ?? p.end - 1.5;
  const after = t >= hit;
  const flash = interpolate(t, [hit - 0.02, hit + 0.04, hit + 0.45], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const draw = interpolate(t, [hit, hit + 1.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const pop = spring({ frame: Math.max(0, Math.round((t - hit) * FPS)), fps: FPS, config: { damping: 12, mass: 0.8 } });
  const shake = after && t < hit + 0.45 ? Math.sin(frame * 2.7) * 14 * (1 - (t - hit) / 0.45) : 0;
  const back = interpolate(t, [hit, hit + 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const wave = interpolate(t, [hit, hit + 1.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const pre = sents.filter((s) => !s.some((w) => w.w.toLowerCase().includes("gravita")));
  const cur = pre.findIndex((s, i) => t < (pre[i + 1]?.[0].start ?? hit));
  const eyebrow = interpolate(t, [hit + 0.5, hit + 1.0], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
      {!after && (
        <>
          <AbsoluteFill style={{ background: "rgba(0,0,0,.55)" }} />
          <div style={{ position: "relative", padding: "0 160px" }}>
            {pre.map((s, i) => i === cur && <KineticLine key={i} words={s} t={t} size={i === 0 ? 92 : 124} highlight={["solução", "chegou"]} />)}
          </div>
        </>
      )}
      {after && (
        <>
          <div style={{ position: "absolute", inset: 0, opacity: 0.6 }}><OrbitDots t={t} leave={1} back={back} /></div>
          <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
            {[0, 0.18, 0.36].map((d, i) => {
              const w = Math.max(0, Math.min(1, (wave - d) / (1 - d)));
              return <circle key={i} cx={960} cy={540} r={120 + w * 1100} fill="none" stroke={C.citrus} strokeWidth={10 * (1 - w)} opacity={(1 - w) * 0.8} />;
            })}
          </svg>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${1.35 - 0.35 * pop})` }}>
            <div style={{ opacity: eyebrow, transform: `translateY(${(1 - eyebrow) * 14}px)`, fontSize: 26, fontWeight: 650, letterSpacing: "0.18em", textTransform: "uppercase", color: C.ink, background: C.citrus, padding: "10px 22px", borderRadius: 999, marginBottom: 40 }}>A sua solução chegou</div>
            <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
              <Logo size={170} draw={draw} />
              <Wordmark size={150} opacity={Math.min(1, draw * 1.6)} />
            </div>
          </div>
        </>
      )}
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.7, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
