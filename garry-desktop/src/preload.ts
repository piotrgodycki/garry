import { contextBridge, ipcRenderer } from "electron";

// The only thing the pages in the Garry window get from the desktop app: Touch
// ID. No Node, no file system; the main process checks which page is asking.
contextBridge.exposeInMainWorld("garryDesktop", {
  unlock: (): Promise<boolean> => ipcRenderer.invoke("garry:unlock"),
  confirm: (reason: string): Promise<boolean> => ipcRenderer.invoke("garry:confirm", reason),
  biometrics: (): Promise<string | null> => ipcRenderer.invoke("garry:biometrics"),
});
