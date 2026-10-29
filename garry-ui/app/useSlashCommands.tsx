import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { GarryCommand } from "garry-client";
import { client } from "./lib/client";
import { Icon } from "./icons";

type Option = { id: string; label: ReactNode; hint: string; icon: ReactNode; run: () => void };

/**
 * Commands after a slash in Garry's field: as you type "/", the commands that
 * fit are suggested; picking one that needs words puts it in the field for
 * them, and Enter runs it at once (the server does the work, so the phone
 * has the same ones). Garry's answer shows above the field.
 */
export function useSlashCommands(text: string, opts: { setText: (t: string) => void; done: () => void; focus: () => void; after: () => void }) {
  const navigate = useNavigate();
  const [commands, setCommands] = useState<GarryCommand[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client.garryCommands().then(setCommands, () => undefined);
  }, []);

  const q = text.trim();
  const slash = q.startsWith("/");
  const [word = "", ...rest] = q.slice(1).split(/\s+/);
  const name = word.toLowerCase();

  const run = async (line: string) => {
    setError(null);
    setSaid(null);
    try {
      const r = await client.runGarryCommand(line);
      opts.done();
      setSaid(r.message);
      if (r.open) navigate(r.open);
      opts.after();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const options: Option[] = !slash
    ? []
    : commands
        .filter((c) => (rest.length ? c.name === name : c.name.startsWith(name)))
        .map((c) => ({
          id: `cmd:${c.name}`,
          label: (
            <>
              <b>/{c.name}</b>
              {c.args && <span className="cmdArgs"> {rest.length ? rest.join(" ") : `<${c.args}>`}</span>}
            </>
          ),
          hint: c.help,
          icon: Icon.bolt,
          // a command that needs words waits for them; the rest run at once
          run: () => (c.args && !rest.length ? (opts.setText(`/${c.name} `), opts.focus()) : void run(rest.length ? `/${c.name} ${rest.join(" ")}` : `/${c.name}`)),
        }));

  return { slash, options, run: () => void run(q), said, error, clear: () => (setSaid(null), setError(null)) };
}
