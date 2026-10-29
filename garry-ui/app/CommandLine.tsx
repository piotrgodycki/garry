import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { GROUPS } from "./Nav";
import { Icon } from "./icons";

type Option = { id: string; label: ReactNode; hint: string; icon: ReactNode; run: () => void };

/**
 * The command line at the foot of every page on a wide screen, ⌘K from
 * anywhere: describe a change and an agent starts on it in Build, talk a
 * thought through with Garry, or type a page's name to go there. The
 * arrows pick, Enter runs, Escape leaves.
 */
export default function CommandLine() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const q = text.trim();
  const done = () => {
    setText("");
    setOpen(false);
    input.current?.blur();
  };
  const pages: Option[] = GROUPS.flatMap((g) => g.links)
    .filter((l) => q && l.label.toLowerCase().includes(q.toLowerCase()))
    .map((l) => ({ id: `go:${l.href}`, label: <>Go to <b>{l.label}</b></>, hint: "page", icon: l.icon, run: () => (navigate(l.href), done()) }));
  const options: Option[] = q
    ? [
        ...(pages.length && q.split(/\s+/).length === 1 ? pages : []),
        { id: "build", label: <>Start work: <b>{q}</b></>, hint: "an agent starts in Build", icon: Icon.code, run: () => (navigate(`/build?task=${encodeURIComponent(q)}`), done()) },
        { id: "talk", label: <>Talk it through with Garry: <b>{q}</b></>, hint: "the voice dock", icon: Icon.mic, run: () => (window.dispatchEvent(new CustomEvent("garry:idea", { detail: q })), done()) },
        ...(pages.length && q.split(/\s+/).length > 1 ? pages : []),
      ]
    : GROUPS.flatMap((g) => g.links).map((l) => ({ id: `go:${l.href}`, label: <>Go to <b>{l.label}</b></>, hint: "page", icon: l.icon, run: () => (navigate(l.href), done()) }));
  const pick = Math.min(at, options.length - 1);

  return (
    <div className="cmdline">
      {open && options.length > 0 && (
        <ul className="cmdList" role="listbox" id="garry-commands" aria-label="commands">
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === pick} className={i === pick ? "on" : ""} onMouseDown={(e) => (e.preventDefault(), o.run())} onMouseEnter={() => setAt(i)}>
              <span className="cmdIcon">{o.icon}</span>
              <span className="cmdLabel">{o.label}</span>
              <span className="cmdHint">{o.hint}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="cmdPrompt" aria-hidden="true">{Icon.agent}</span>
      <input
        ref={input}
        className="cmdInput"
        role="combobox"
        aria-label="tell Garry"
        aria-expanded={open}
        aria-controls="garry-commands"
        placeholder="Tell Garry what to build, or type a page to go to"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setAt(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setAt((pick + 1) % options.length));
          else if (e.key === "ArrowUp") (e.preventDefault(), setAt((pick - 1 + options.length) % options.length));
          else if (e.key === "Enter" && options[pick]) (e.preventDefault(), options[pick].run());
          else if (e.key === "Escape") done();
        }}
      />
      <span className="cmdKeys" aria-hidden="true">
        <kbd className="kbd">⌘K</kbd> commands <kbd className="kbd">⌘J</kbd> talk
      </span>
    </div>
  );
}
