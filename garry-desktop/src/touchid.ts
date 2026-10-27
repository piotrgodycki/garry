import { BrowserWindow, ipcMain, powerMonitor, systemPreferences, type IpcMainInvokeEvent } from "electron";

/**
 * Touch ID on macOS: the app opens locked, locks again when the screen locks,
 * the Mac sleeps, or after ten idle minutes, and the dashboard asks for Touch ID
 * before it starts work, commits or opens a pull request. Other platforms and
 * Macs without Touch ID are unchanged.
 */

const IDLE_LOCK_SECONDS = 10 * 60;

export const touchIdAvailable = (): boolean => process.platform === "darwin" && systemPreferences.canPromptTouchID();

async function prompt(reason: string): Promise<boolean> {
  try {
    await systemPreferences.promptTouchID(reason);
    return true;
  } catch {
    return false;
  }
}

const lockPage = (message: string) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Garry is locked</title>
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;font:15px -apple-system,system-ui,sans-serif;background:#0a0a0a;color:#fafafa;text-align:center}
  h1{font-size:22px;margin:0 0 8px} p{color:#9a9a9a;margin:0 0 24px}
  button{font:800 13px -apple-system,system-ui;letter-spacing:.1em;text-transform:uppercase;padding:14px 24px;background:#fafafa;color:#0a0a0a;border:0;cursor:pointer}
</style>
<div><h1>Garry is locked</h1><p>${message}</p><button id="u" autofocus>Unlock with Touch ID</button></div>
<script>document.getElementById("u").onclick=()=>window.garryDesktop&&window.garryDesktop.unlock()</script>`)}`;

export interface TouchIdOptions {
  enabled: () => boolean;
  /** the dashboard's address, which the window shows once unlocked */
  dashboard: () => string;
  window: () => BrowserWindow | null;
}

/** Wires Touch ID into the app. Returns whether the first window should open locked. */
export function setupTouchId(o: TouchIdOptions): { locked: () => boolean; lock: () => void; unlock: () => Promise<boolean>; confirm: (reason: string) => Promise<boolean>; page: () => string } {
  let locked = touchIdAvailable() && o.enabled();
  const active = () => touchIdAvailable() && o.enabled();

  const lock = () => {
    if (!active() || locked) return;
    locked = true;
    void o.window()?.loadURL(lockPage("Touch ID keeps your code and agents to you."));
  };

  // only Garry's own pages (the dashboard and the lock page) may ask
  const trusted = (e: IpcMainInvokeEvent) => {
    const url = e.senderFrame?.url ?? "";
    return url.startsWith(o.dashboard()) || url.startsWith("data:text/html");
  };

  const unlock = async () => {
    if (!locked) return true;
    if (!(await prompt("unlock Garry"))) return false;
    locked = false;
    await o.window()?.loadURL(o.dashboard());
    return true;
  };
  const confirm = async (reason: string) => (active() ? prompt(reason.slice(0, 120)) : true);

  ipcMain.handle("garry:unlock", (e) => (trusted(e) ? unlock() : false));
  ipcMain.handle("garry:confirm", async (e, reason: unknown) => {
    if (!trusted(e) || !e.senderFrame?.url.startsWith(o.dashboard())) return false;
    return confirm(String(reason ?? "confirm this in Garry"));
  });
  ipcMain.handle("garry:biometrics", () => (active() ? "Touch ID" : null));

  powerMonitor.on("lock-screen", lock);
  powerMonitor.on("suspend", lock);
  setInterval(() => powerMonitor.getSystemIdleTime() > IDLE_LOCK_SECONDS && lock(), 30_000).unref();

  const page = () => lockPage("Touch ID keeps your code and agents to you.");
  return { locked: () => locked, lock, unlock, confirm, page };
}

export { lockPage };
