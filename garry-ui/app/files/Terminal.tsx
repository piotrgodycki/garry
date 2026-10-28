import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { client } from "../lib/client";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * One shell, drawn by xterm.js. What is typed goes to the shell on the
 * computer running Garry; what it prints streams back. It fits its box and
 * tells the shell when the box changes size.
 */
export default function Terminal({ id, active, onExit }: { id: string; active: boolean; onExit: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const term = useRef<XTerm | null>(null);
  const fit = useRef<FitAddon | null>(null);

  useEffect(() => {
    const t = new XTerm({
      fontFamily: css("--font-family-mono") || "ui-monospace, Menlo, monospace",
      fontSize: 12.5,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
      theme: { background: css("--surface") || undefined, foreground: css("--color-text-default") || undefined, cursor: css("--accent") || undefined, selectionBackground: "rgba(127,127,127,0.35)" },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(box.current!);
    term.current = t;
    fit.current = f;

    // typing goes out in small batches, one request at a time, so keys arrive in order
    let pending = "";
    let timer: number | null = null;
    let chain: Promise<unknown> = Promise.resolve();
    const send = () => {
      timer = null;
      const data = pending;
      pending = "";
      if (data) chain = chain.then(() => client.terminalInput(id, data)).catch(() => undefined);
    };
    const typed = t.onData((d) => {
      pending += d;
      if (timer === null) timer = window.setTimeout(send, 8);
    });

    const abort = new AbortController();
    void client
      .followTerminal(id, (d) => t.write(d), abort.signal)
      .then((end) => {
        if (end) {
          t.write(`\r\n\x1b[2m[the shell ended${end.code ? ` with code ${end.code}` : ""}]\x1b[0m\r\n`);
          onExit();
        }
      })
      .catch(() => undefined);

    // follow the box: fit, then tell the shell
    let last = "";
    const resize = () => {
      if (!box.current?.offsetWidth) return;
      try {
        f.fit();
      } catch {
        return;
      }
      const size = `${t.cols}x${t.rows}`;
      if (size !== last) {
        last = size;
        void client.resizeTerminal(id, t.cols, t.rows).catch(() => undefined);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box.current!);
    resize();

    return () => {
      ro.disconnect();
      abort.abort();
      typed.dispose();
      if (timer !== null) window.clearTimeout(timer);
      t.dispose();
    };
    // the terminal is made once per shell
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!active) return;
    try {
      fit.current?.fit();
    } catch {
      /* not laid out yet */
    }
    term.current?.focus();
  }, [active]);

  return <div ref={box} style={{ position: "absolute", inset: "6px 0 0 10px", visibility: active ? "visible" : "hidden" }} aria-label="terminal" />;
}
