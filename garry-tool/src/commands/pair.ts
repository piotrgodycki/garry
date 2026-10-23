import pc from "picocolors";
import { DeviceStore } from "../server/auth.js";
import { reachableAddresses, printPairing } from "../server/pairing.js";

const PAIR_HELP = `garry pair [--port <n>] [--host <address>]

Prints a one-time pairing link and QR code for a running garry serve, so a phone
or another computer can connect. Each code pairs one device and expires after
10 minutes. Run it on the computer running Garry.

Options:
  --port <n>         the server's port (default: 8123)
  --host <address>   the address other devices reach this computer on
                     (default: the first LAN address, then Tailscale)
`;

const DEVICES_HELP = `garry devices [list | revoke <id>]

Lists the paired phones and computers, or revokes one so its token stops
working at once.
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function runPair(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(PAIR_HELP);
    return;
  }
  const port = Number(flag(argv, "port") ?? 8123);
  const host = flag(argv, "host") ?? reachableAddresses()[0];
  if (!host) throw new Error("no network address found; pass --host with the address other devices reach");

  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/pair/codes`, { method: "POST" });
  } catch {
    throw new Error(`garry serve is not running on port ${port}; start it with garry serve --host ${host}`);
  }
  if (!res.ok) throw new Error(`the server refused: ${((await res.json()) as { error?: string }).error ?? res.status}`);
  const { code, expiresAt } = (await res.json()) as { code: string; expiresAt: string };
  await printPairing(host, port, code, expiresAt);
  console.log(pc.dim(`The server must listen on ${host} (garry serve --host ${host}) for the device to reach it.`));
}

export async function runDevices(argv: string[]): Promise<void> {
  const [sub = "list", id] = argv;
  if (sub === "--help" || sub === "-h") {
    console.log(DEVICES_HELP);
    return;
  }
  const store = new DeviceStore();
  if (sub === "list") {
    const devices = store.list();
    if (!devices.length) {
      console.log(pc.dim("No paired devices. Run garry pair to add one."));
      return;
    }
    for (const d of devices) {
      const seen = d.lastSeenAt ? `last seen ${new Date(d.lastSeenAt).toLocaleString()}` : "never connected";
      console.log(`${d.id}  ${pc.bold(d.name.padEnd(24))} paired ${new Date(d.createdAt).toLocaleDateString()}, ${seen}`);
    }
    return;
  }
  if (sub === "revoke") {
    if (!id) throw new Error("garry devices revoke needs a device id (see garry devices list)");
    if (!store.revoke(id)) throw new Error(`no device ${id}`);
    console.log(pc.green(`Revoked ${id}. Its token no longer works.`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${DEVICES_HELP}`);
}
