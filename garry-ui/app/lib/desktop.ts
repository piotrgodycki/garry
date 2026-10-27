// Inside the Garry desktop app on a Mac with Touch ID, actions that change code
// ask for Touch ID first. In a browser there is no desktop bridge and nothing
// is asked.
interface DesktopBridge {
  confirm: (reason: string) => Promise<boolean>;
  biometrics: () => Promise<string | null>;
}

const bridge = (): DesktopBridge | undefined => (globalThis as { garryDesktop?: DesktopBridge }).garryDesktop;

export async function confirmAction(reason: string): Promise<boolean> {
  const b = bridge();
  return b ? b.confirm(reason) : true;
}
