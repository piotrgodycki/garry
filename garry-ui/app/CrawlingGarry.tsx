import { useEffect, useRef } from "react";
import styles from "./crawl.module.css";

/**
 * Garry crawling along a strip of soil at the foot of the dashboard. He moves
 * the way an earthworm does: a wave of contraction runs from head to tail,
 * squeezed segments grow fat and grip the ground, stretched ones grow thin and
 * slide forward, so he surges and rests on his own. Drawn on a canvas at the
 * screen's pixel density, timed by the clock rather than by frames. He pauses
 * and looks up when the pointer comes near his head, crawls faster while
 * agents are at work, leaves a faint moist trail, and walks on from the left
 * once he leaves the right. Still when motion is reduced, idle when off
 * screen. Colours come from the theme (--garry-*, --soil, --leaf).
 */

const N = 28; // points along the body, head first
const L0 = 6.4; // a segment at rest, in CSS pixels
const A = 0.24; // how much a segment stretches and squeezes
const K = 1.35; // contraction waves along the body
const HEIGHT = 92;

type Paint = { worm: string; ring: string; clay: string; ink: string; soil: string; soil2: string; pebble: string; leaf: string; light: string; shade: string; trail: string };

const read = (el: Element): Paint => {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  const dark = cs.colorScheme.includes("dark") || cs.getPropertyValue("color-scheme").includes("dark");
  return {
    worm: v("--garry-worm", "#ee9b86"),
    ring: v("--garry-ring", "#c47562"),
    clay: v("--garry-clay", "#d9573a"),
    ink: v("--garry-ink", "#2a1d19"),
    soil: v("--soil", "#e8ddd2"),
    soil2: v("--soil-2", "#d9c9ba"),
    pebble: v("--pebble", "#c4b4a5"),
    leaf: v("--leaf", "#3f9b52"),
    light: "rgba(255, 236, 228, 0.55)",
    shade: "rgba(120, 50, 35, 0.22)",
    trail: dark ? "rgba(0, 0, 0, 0.1)" : "rgba(90, 60, 40, 0.05)",
  };
};

// a little deterministic noise so the ground and pebbles keep their shape on resize
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

/** body width along the body: a rounded head, the thickest part a third back, a thin tail */
const girth = (s: number) => 6 + 11 * Math.pow(Math.sin(Math.PI * (0.12 + 0.86 * s)), 0.7);

export default function CrawlingGarry({ busy = false }: { busy?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let paint = read(canvas);
    let W = 0;
    let dpr = 1;
    let ground: (x: number) => number = () => HEIGHT - 30;
    let backdrop: HTMLCanvasElement | null = null;
    const trail = document.createElement("canvas");
    const tctx = trail.getContext("2d")!;

    // the worm
    let tau = 0;
    let headX = -40;
    let xs: number[] = [];
    let speed = 1; // eased: 0 when he stops to look, 1 crawling, more when busy
    let look = 0; // eased: how far he lifts his head
    let pointer: { x: number; y: number } | null = null;
    let lastTail: number | null = null;
    let nextBlink = 2.5;
    let blink = 0;
    let t = 0;

    const layout = () => {
      const e: number[] = [];
      const r: number[] = [0];
      for (let i = 0; i < N; i++) e.push(1 + A * Math.sin(2 * Math.PI * (K * (i / (N - 1)) - tau)));
      for (let i = 1; i < N; i++) r.push(r[i - 1] - (L0 * (e[i - 1] + e[i])) / 2);
      return { e, r };
    };
    const bodyLength = () => (N - 1) * L0;

    const drawBackdrop = () => {
      backdrop = document.createElement("canvas");
      backdrop.width = Math.round(W * dpr);
      backdrop.height = Math.round(HEIGHT * dpr);
      const b = backdrop.getContext("2d")!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      const base = HEIGHT - 30;
      ground = (x) => base + 2.6 * Math.sin(x / 150 + 0.6) + 1.4 * Math.sin(x / 57 + 2.1);
      // the far bank, then the near one
      b.fillStyle = paint.soil2;
      b.beginPath();
      b.moveTo(0, HEIGHT);
      for (let x = 0; x <= W + 8; x += 8) b.lineTo(x, ground(x) - 5 + 3 * Math.sin(x / 90 + 1.3));
      b.lineTo(W, HEIGHT);
      b.closePath();
      b.fill();
      b.fillStyle = paint.soil;
      b.beginPath();
      b.moveTo(0, HEIGHT);
      for (let x = 0; x <= W + 8; x += 8) b.lineTo(x, ground(x));
      b.lineTo(W, HEIGHT);
      b.closePath();
      b.fill();
      // pebbles and crumbs in the soil
      const count = Math.round(W / 26);
      for (let i = 0; i < count; i++) {
        const x = hash(i + 1) * W;
        const y = ground(x) + 9 + hash(i + 7) * 18;
        const r = 0.8 + hash(i + 3) * (hash(i + 11) > 0.85 ? 3.2 : 1.6);
        b.fillStyle = paint.pebble;
        b.globalAlpha = 0.55 + hash(i + 5) * 0.45;
        b.beginPath();
        b.ellipse(x, y, r * 1.3, r, hash(i) * Math.PI, 0, Math.PI * 2);
        b.fill();
      }
      b.globalAlpha = 1;
    };

    const sprouts = () => [0.17, 0.58, 0.86].filter((p) => p * W > 40).map((p, i) => ({ x: p * W, h: 14 + (i % 2) * 6, phase: i * 1.7 }));

    const drawSprout = (x: number, h: number, sway: number) => {
      const y = ground(x);
      ctx.save();
      ctx.translate(x, y + 1);
      ctx.rotate(sway);
      ctx.strokeStyle = paint.leaf;
      ctx.fillStyle = paint.leaf;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(1, -h / 2, 0, -h);
      ctx.stroke();
      const leaf = (dir: number, size: number, at: number) => {
        ctx.beginPath();
        ctx.moveTo(0, -at);
        ctx.quadraticCurveTo(dir * size * 0.9, -at - size * 0.95, dir * size * 1.15, -at - size * 0.35);
        ctx.quadraticCurveTo(dir * size * 0.55, -at + size * 0.1, 0, -at);
        ctx.fill();
      };
      leaf(-1, 7, h * 0.72);
      leaf(1, 8, h * 0.9);
      ctx.restore();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(HEIGHT * dpr);
      trail.width = canvas.width;
      trail.height = canvas.height;
      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackdrop();
      if (!xs.length) {
        headX = reduce.matches ? W * 0.42 : Math.min(W * 0.3, 260);
        const { r } = layout();
        xs = r.map((v) => v + headX);
      }
      draw();
    };

    const step = (dt: number) => {
      t += dt;
      // ease the speed and the head: slow and look up near the pointer, hurry when agents work
      const head = { x: headX, y: ground(headX) - 10 };
      const near = pointer && Math.hypot(pointer.x - head.x, pointer.y - head.y) < 70;
      const target = near ? 0 : busyRef.current ? 1.55 : 1;
      speed += (target - speed) * (1 - Math.exp(-dt * (near ? 7 : 2.2)));
      look += ((near ? 1 : 0) - look) * (1 - Math.exp(-dt * 5));
      tau += dt * 1.1 * speed;

      const { e, r } = layout();
      // the squeezed segments grip the ground; the rest of the body moves around them
      let num = 0;
      let den = 0;
      for (let i = 0; i < N; i++) {
        const g = Math.pow(Math.max(0, -(e[i] - 1) / A), 2) + 0.02;
        num += g * (xs[i] - r[i]);
        den += g;
      }
      headX = Math.max(headX, num / den);
      xs = r.map((v) => v + headX);

      // off the right edge: on again from the left, trail and all
      if (xs[N - 1] > W + 30) {
        const shift = W + bodyLength() + 80;
        headX -= shift;
        xs = xs.map((x) => x - shift);
      }

      // a moist trail from the tail, fading slowly
      tctx.globalCompositeOperation = "destination-out";
      tctx.fillStyle = `rgba(0, 0, 0, ${1 - Math.exp(-dt * 0.45)})`;
      tctx.fillRect(0, 0, W, HEIGHT);
      tctx.globalCompositeOperation = "source-over";
      const tx = xs[N - 1];
      if (lastTail !== null && tx > lastTail && tx - lastTail < 40 && tx > 0 && lastTail < W) {
        tctx.strokeStyle = paint.trail;
        tctx.lineWidth = 2.4;
        tctx.lineCap = "round";
        tctx.beginPath();
        tctx.moveTo(lastTail, ground(lastTail) + 0.8);
        tctx.lineTo(tx, ground(tx) + 0.8);
        tctx.stroke();
      }
      lastTail = tx;

      // blink now and then
      if (t > nextBlink) {
        blink = 0.14;
        nextBlink = t + 2.8 + hash(t) * 3.5;
      }
      blink = Math.max(0, blink - dt);
      return e;
    };

    const draw = (e = layout().e) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, HEIGHT);
      if (backdrop) ctx.drawImage(backdrop, 0, 0, W, HEIGHT);
      ctx.drawImage(trail, 0, 0, W, HEIGHT);
      for (const s of sprouts()) drawSprout(s.x, s.h, reduce.matches ? 0 : 0.07 * Math.sin(t * 1.3 + s.phase));

      // the spine: each point sits on the ground, fat squeezed segments rise higher
      const w = xs.map((_, i) => girth(i / (N - 1)) / Math.sqrt(e[i]));
      const ys = xs.map((x, i) => {
        const lift = i < 4 ? (1 - i / 4) * (2 + 1.2 * Math.sin(t * 2.3) + look * 9) : 0;
        return ground(x) - w[i] / 2 - lift;
      });
      // normals, then the two edges of the body
      const nx: number[] = [];
      const ny: number[] = [];
      for (let i = 0; i < N; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(N - 1, i + 1);
        const dx = xs[a] - xs[b];
        const dy = ys[a] - ys[b];
        const len = Math.hypot(dx, dy) || 1;
        nx.push(-dy / len);
        ny.push(dx / len);
      }
      const edge = (side: number, k = 1) => xs.map((x, i) => [x + nx[i] * side * (w[i] / 2) * k, ys[i] + ny[i] * side * (w[i] / 2) * k] as const);
      const top = edge(-1);
      const bottom = edge(1);

      // a smooth outline: curves through the midpoints of each edge, round at head and tail
      const outline = (path: CanvasRenderingContext2D) => {
        path.beginPath();
        path.moveTo(top[0][0], top[0][1]);
        for (let i = 1; i < N - 1; i++) path.quadraticCurveTo(top[i][0], top[i][1], (top[i][0] + top[i + 1][0]) / 2, (top[i][1] + top[i + 1][1]) / 2);
        path.lineTo(top[N - 1][0], top[N - 1][1]);
        const tail = Math.atan2(ny[N - 1], nx[N - 1]);
        path.arc(xs[N - 1], ys[N - 1], w[N - 1] / 2, tail + Math.PI, tail + Math.PI * 2, true);
        for (let i = N - 2; i > 0; i--) path.quadraticCurveTo(bottom[i][0], bottom[i][1], (bottom[i][0] + bottom[i - 1][0]) / 2, (bottom[i][1] + bottom[i - 1][1]) / 2);
        path.lineTo(bottom[0][0], bottom[0][1]);
        const head = Math.atan2(ny[0], nx[0]);
        path.arc(xs[0], ys[0], w[0] / 2, head, head + Math.PI, true);
        path.closePath();
      };

      // soft contact shadow, then the body
      ctx.save();
      ctx.shadowColor = "rgba(40, 20, 10, 0.22)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = paint.worm;
      outline(ctx);
      ctx.fill();
      ctx.restore();

      ctx.save();
      outline(ctx);
      ctx.clip();
      // the clitellum, a smooth band a fifth of the way back
      ctx.fillStyle = paint.clay;
      ctx.beginPath();
      const c0 = 5;
      const c1 = 9;
      ctx.moveTo(top[c0][0], top[c0][1]);
      for (let i = c0 + 1; i <= c1; i++) ctx.lineTo(top[i][0], top[i][1]);
      for (let i = c1; i >= c0; i--) ctx.lineTo(bottom[i][0], bottom[i][1]);
      ctx.closePath();
      ctx.fill();
      // roundness: a highlight along the back, a shade along the belly
      const stripe = (k: number, color: string, width: number) => {
        ctx.strokeStyle = color;
        ctx.lineCap = "round";
        ctx.beginPath();
        xs.forEach((x, i) => {
          const px = x + nx[i] * k * (w[i] / 2);
          const py = ys[i] + ny[i] * k * (w[i] / 2);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.lineWidth = width;
        ctx.stroke();
      };
      stripe(-0.48, paint.light, 2.6);
      stripe(0.62, paint.shade, 3.2);
      // the rings between segments, none across the band
      ctx.strokeStyle = paint.ring;
      ctx.lineWidth = 1.15;
      ctx.globalAlpha = 0.8;
      for (let i = 2; i < N - 1; i++) {
        if (i >= c0 && i <= c1) continue;
        const a = edge(-1, 1.05)[i];
        const b = edge(1, 1.05)[i];
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(xs[i] - 1.6, ys[i], b[0], b[1]);
        ctx.stroke();
      }
      ctx.restore();

      // the face: an eye that blinks, a little blush
      const hx = xs[0] - 2.5 + nx[0] * -1.5;
      const hy = ys[0] - w[0] * 0.12 - look * 0.8;
      ctx.fillStyle = paint.ink;
      ctx.beginPath();
      const open = blink > 0 ? 0.15 : 1;
      ctx.ellipse(hx, hy, 1.45, 1.75 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      if (open === 1) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(hx + 0.5, hy - 0.6, 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = paint.clay;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(hx - 3.2, hy + 3.4, 2, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    // the loop: by the clock, only while on screen, not at all with reduced motion
    let raf = 0;
    let last = 0;
    let visible = true;
    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      draw(step(dt));
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (raf || reduce.matches || !visible) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onMotion = () => (reduce.matches ? (stop(), draw()) : start());
    reduce.addEventListener("change", onMotion);
    // the theme changed: repaint with its colours
    const retheme = () => {
      paint = read(canvas);
      drawBackdrop();
      draw();
    };
    const mo = new MutationObserver(retheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", retheme);
    const move = (ev: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const leave = () => (pointer = null);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);

    resize();
    start();
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      reduce.removeEventListener("change", onMotion);
      scheme.removeEventListener("change", retheme);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div className={styles.strip} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} data-garry-crawl="" />
    </div>
  );
}
