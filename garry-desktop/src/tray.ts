import { app, Menu, nativeImage, Notification, Tray, type MenuItemConstructorOptions, type NativeImage } from "electron";
import { join } from "node:path";
import type { ThreadManager } from "../../garry-tool/src/threads/manager.js";
import { garryStatus, statusChanges, type GarryStatus, type StatusItem } from "../../garry-tool/src/status/status.js";

/**
 * Garry in the menu bar: the G shows whether an agent is working (moving
 * dots), needs you (!) or has something ready (a tick), with how many need you
 * beside it. The menu lists the work; a click opens it. Notifications say when
 * something becomes ready or needs you, and the Dock icon carries the count.
 * The icons are template images, so the menu bar draws them light or dark.
 */

const LABEL: Record<StatusItem["state"], string> = { "needs-you": "Needs you", working: "Working", done: "Ready" };

export function setupTray(opts: { threads: () => ThreadManager | undefined; open: (path: string) => void }): () => void {
  const icon = (name: string): NativeImage => {
    const img = nativeImage.createFromPath(join(app.getAppPath(), "build", "tray", `${name}Template.png`));
    img.setTemplateImage(true);
    return img;
  };
  const tray = new Tray(icon("idle"));
  tray.setToolTip("Garry");
  let last: GarryStatus | null = null;
  let frame = 0;
  let spinner: NodeJS.Timeout | null = null;

  const render = (s: GarryStatus) => {
    // working: the dots move; otherwise one still icon
    if (s.state === "working" && !spinner) {
      spinner = setInterval(() => tray.setImage(icon(`working-${(frame++ % 3) + 1}`)), 450);
    } else if (s.state !== "working" && spinner) {
      clearInterval(spinner);
      spinner = null;
    }
    if (s.state !== "working") tray.setImage(icon(s.state === "needs-you" ? "needs" : s.state === "done" ? "done" : "idle"));
    tray.setTitle(s.counts.needsYou ? ` ${s.counts.needsYou}` : "");
    const summary = s.state === "idle" ? "Garry is idle" : `Garry: ${[s.counts.needsYou && `${s.counts.needsYou} need you`, s.counts.working && `${s.counts.working} working`, s.counts.done && `${s.counts.done} ready`].filter(Boolean).join(", ")}`;
    tray.setToolTip(summary);
    if (process.platform === "darwin") app.dock?.setBadge(s.counts.needsYou ? String(s.counts.needsYou) : "");

    const items: MenuItemConstructorOptions[] = s.items.length
      ? s.items.slice(0, 12).map((i) => ({
          label: `${i.state === "needs-you" ? "●" : i.state === "working" ? "◌" : "✓"}  ${i.title}`,
          sublabel: `${LABEL[i.state]}: ${i.detail}`,
          click: () => opts.open(`/build/${i.threadId}`),
        }))
      : [{ label: "Nothing in flight", enabled: false }];
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: summary, enabled: false },
        { type: "separator" },
        ...items,
        { type: "separator" },
        { label: "Open Garry", click: () => opts.open("/build") },
        { label: "Quit Garry", role: "quit" },
      ]),
    );
  };

  const notify = (i: StatusItem) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: i.state === "needs-you" ? `Garry needs you: ${i.title}` : `Ready for review: ${i.title}`,
      body: i.detail,
      silent: i.state === "done",
    });
    n.on("click", () => opts.open(`/build/${i.threadId}`));
    n.show();
  };

  const refresh = () => {
    const threads = opts.threads();
    if (!threads) return;
    const next = garryStatus(threads);
    // the first look sets the scene; only what changes after it is news
    if (last) for (const i of statusChanges(last, next)) notify(i);
    last = next;
    render(next);
  };

  // every thread event can change the picture; settle bursts of them
  let pending: NodeJS.Timeout | null = null;
  const onEvent = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      refresh();
    }, 250);
  };
  let unsubscribe = opts.threads()?.subscribeAll(onEvent) ?? (() => undefined);
  refresh();

  // a restarted server brings a new ThreadManager: follow it
  return () => {
    unsubscribe();
    unsubscribe = opts.threads()?.subscribeAll(onEvent) ?? (() => undefined);
    last = null;
    refresh();
  };
}
