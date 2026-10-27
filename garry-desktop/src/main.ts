import { app, BrowserWindow, dialog, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import QRCode from "qrcode";
import { createGarryServer } from "../../garry-tool/src/server/server.js";
import { DeviceStore, garryHome, pairingLink } from "../../garry-tool/src/server/auth.js";
import { advertisedHost, hostsFor } from "../../garry-tool/src/server/pairing.js";
import { defaultRegistry, defaultSkillsRoot, defaultUiDir } from "../../garry-tool/src/paths.js";
import { loadEnv } from "../../garry-tool/src/github/env.js";
import { ThreadManager } from "../../garry-tool/src/threads/manager.js";
import { fileURLToPath } from "node:url";
import { setupTouchId, touchIdAvailable } from "./touchid.js";

/**
 * The Garry desktop app: runs garry serve inside the app and shows the dashboard
 * it hosts. The project folder (registry, garry.routing.json, .env.local) is
 * chosen from the File menu and remembered. Other devices can connect only when
 * "Allow phones and other computers" is on, and only after pairing.
 */

interface Settings {
  project?: string;
  network?: boolean;
  /** Touch ID on Macs that have it; on unless turned off */
  touchId?: boolean;
}

const PORT = 8123;
const settingsFile = () => join(app.getPath("userData"), "settings.json");

function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsFile(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

function writeSettings(s: Settings): void {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}

let settings: Settings = {};
let server: Server | null = null;
let port = PORT;
let devices: DeviceStore;
let win: BrowserWindow | null = null;
let touch: ReturnType<typeof setupTouchId>;
const dashboard = () => `http://127.0.0.1:${port}/`;

/** Starts the server in the project folder: on :8123, or a free port when that is taken. */
async function startServer(): Promise<void> {
  if (settings.project && existsSync(settings.project)) process.chdir(settings.project);
  else process.chdir(app.getPath("home"));
  loadEnv();

  const host = settings.network ? "0.0.0.0" : "127.0.0.1";
  devices = new DeviceStore();
  const threads = new ThreadManager();
  // the project folder, when it is a repository, is where agents work
  if (existsSync(join(process.cwd(), ".git"))) threads.store.addProject(process.cwd());
  const s = createGarryServer(
    {
      registry: defaultRegistry(),
      skills: defaultSkillsRoot(),
      routing: "garry.routing.json",
      ui: defaultUiDir(),
      hosts: hostsFor(host),
      threads,
    },
    devices,
  );
  port = await new Promise<number>((resolve, reject) => {
    const listen = (p: number) => {
      s.once("error", (e: NodeJS.ErrnoException) => {
        // phones need a stable port; this machine alone can live with any
        if (e.code === "EADDRINUSE" && p !== 0 && !settings.network) listen(0);
        else reject(e);
      });
      s.listen(p, host, () => resolve((s.address() as AddressInfo).port));
    };
    listen(PORT);
  });
  server = s;
}

async function restartServer(): Promise<void> {
  // live event streams would otherwise keep the old server open
  server?.closeAllConnections();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  try {
    await startServer();
  } catch (e) {
    dialog.showErrorBox("Garry could not start its server", String((e as Error).message ?? e));
    settings.network = false;
    writeSettings(settings);
    await startServer();
  }
  await win?.loadURL(touch.locked() ? touch.page() : dashboard());
  buildMenu();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 600,
    title: "Garry",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Touch ID for the dashboard and the lock page, nothing else
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
    },
  });
  const origin = () => `http://127.0.0.1:${port}`;
  // the dashboard stays in the app; any other link opens in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(origin())) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  win.on("closed", () => (win = null));
  void win.loadURL(touch.locked() ? touch.page() : `${origin()}/`);
  // the system Touch ID prompt right away, the lock page's button if it is dismissed
  if (touch.locked()) win.webContents.once("did-finish-load", () => void touch.unlock());
}

async function chooseProject(): Promise<void> {
  const r = await dialog.showOpenDialog({
    title: "Open a Garry project",
    message: "Pick the folder with your registry (or the Garry repository).",
    properties: ["openDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return;
  settings.project = r.filePaths[0];
  writeSettings(settings);
  await restartServer();
}

async function toggleNetwork(on: boolean): Promise<void> {
  settings.network = on;
  writeSettings(settings);
  await restartServer();
  if (on) await showPairing();
}

/** A window with a one-time pairing QR code for a phone or another computer. */
async function showPairing(): Promise<void> {
  if (!settings.network) {
    const r = await dialog.showMessageBox({
      type: "question",
      buttons: ["Allow and pair", "Cancel"],
      message: "Allow phones and other computers on this network?",
      detail: "Garry then listens on your network. Each device still has to pair with a one-time code.",
    });
    if (r.response === 0) await toggleNetwork(true);
    return;
  }
  const address = advertisedHost("0.0.0.0");
  if (!address) {
    dialog.showErrorBox("No network", "This computer has no network address another device could reach.");
    return;
  }
  const { code, expiresAt } = devices.createCode();
  const link = pairingLink(address, port, code);
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 280 });
  const html = `<!doctype html><meta charset="utf-8"><title>Pair a device</title>
<body style="margin:0;font:14px system-ui;background:#fff;color:#0a0a0a;display:grid;place-items:center;height:100vh;text-align:center">
<div><img src="${qr}" width="280" height="280" alt="Pairing QR code"><p style="margin:16px 24px 4px">Scan with the Garry app, or open the link on another computer:</p>
<p style="font:12px ui-monospace,monospace;word-break:break-all;margin:0 24px">${link}</p>
<p style="color:#666;font-size:12px">One device, one use, until ${new Date(expiresAt).toLocaleTimeString()}.</p></div></body>`;
  const w = new BrowserWindow({ width: 420, height: 520, title: "Pair a device", parent: win ?? undefined, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  w.setMenuBarVisibility(false);
  void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function showDevices(): Promise<void> {
  const list = devices.list();
  if (!list.length) {
    await dialog.showMessageBox({ message: "No paired devices.", detail: "Devices, Pair a device adds one." });
    return;
  }
  const r = await dialog.showMessageBox({
    message: "Paired devices",
    detail: list.map((d, i) => `${i + 1}. ${d.name}, ${d.lastSeenAt ? `last seen ${new Date(d.lastSeenAt).toLocaleString()}` : "never connected"}`).join("\n"),
    buttons: ["Close", ...list.map((d) => `Revoke ${d.name}`)],
  });
  if (r.response > 0) devices.revoke(list[r.response - 1].id);
}

function buildMenu(): void {
  const mac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => void chooseProject() },
        { label: settings.project ? `Project: ${settings.project}` : "Project: ~/.garry/registry", enabled: false },
        { type: "separator" },
        { label: "Open in Browser", click: () => void shell.openExternal(`http://127.0.0.1:${port}/`) },
        { label: "Show Garry Data Folder", click: () => void shell.openPath(garryHome()) },
        { type: "separator" },
        mac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    {
      label: "Devices",
      submenu: [
        { label: "Allow Phones and Other Computers", type: "checkbox", checked: Boolean(settings.network), click: (item) => void toggleNetwork(item.checked) },
        { label: "Pair a Device…", click: () => void showPairing() },
        { label: "Paired Devices…", click: () => void showDevices() },
        ...(touchIdAvailable()
          ? [
              { type: "separator" as const },
              {
                label: "Require Touch ID",
                type: "checkbox" as const,
                checked: settings.touchId !== false,
                click: async (item: Electron.MenuItem) => {
                  // turning it off is itself a Touch ID decision
                  if (!item.checked && !(await touch.confirm("turn off Touch ID for Garry"))) {
                    item.checked = true;
                    return;
                  }
                  settings.touchId = item.checked;
                  writeSettings(settings);
                },
              },
              { label: "Lock Garry", accelerator: "CmdOrCtrl+Shift+L", enabled: settings.touchId !== false, click: () => touch.lock() },
            ]
          : []),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Garry Documentation", click: () => void shell.openExternal("https://github.com/piotrgodycki/garry#readme") },
        { label: "Report an Issue", click: () => void shell.openExternal("https://github.com/piotrgodycki/garry/issues") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    settings = readSettings();
    touch = setupTouchId({ enabled: () => settings.touchId !== false, dashboard, window: () => win });
    try {
      await startServer();
    } catch (e) {
      dialog.showErrorBox("Garry could not start its server", String((e as Error).message ?? e));
      app.quit();
      return;
    }
    buildMenu();
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => server?.close());
}
