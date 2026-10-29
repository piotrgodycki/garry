import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  /** a heading the option sits under */
  group?: string;
  /** a second, quieter line */
  hint?: string;
  /** drawn before the label: a logo, a coloured dot */
  icon?: ReactNode;
  disabled?: boolean;
}

/**
 * A dropdown drawn in the dashboard's own style, in place of the browser's.
 * It behaves like a select for mouse, touch and keyboard: Enter, Space or the
 * arrows open it, the arrows move, typing jumps to a match, Enter picks,
 * Escape and Tab close. The list floats above everything, so a panel that
 * clips its content does not cut it off.
 */
export default function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Choose…",
  className = "",
  disabled = false,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const current = options.find((o) => o.value === value);
  const enabled = useMemo(() => options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0), [options]);

  const show = () => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 && !options[i].disabled ? i : (enabled[0] ?? -1));
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) button.current?.focus();
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };
  const move = (by: number) => {
    if (!enabled.length) return;
    const at = enabled.indexOf(active);
    const next = at < 0 ? (by > 0 ? 0 : enabled.length - 1) : Math.min(enabled.length - 1, Math.max(0, at + by));
    setActive(enabled[next]);
  };
  // typing a few letters jumps to the first option that starts with them
  const jump = (key: string) => {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + key.toLowerCase(), at: now };
    const hit = enabled.find((i) => options[i].label.toLowerCase().startsWith(typed.current.text));
    if (hit !== undefined) setActive(hit);
    return hit;
  };

  // place the list under the button, or above it when there is no room below;
  // it follows the button when the page scrolls, and closes once the button is gone
  const measure = () => {
    if (!button.current) return;
    const r = button.current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return close(false);
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const up = below < 220 && above > below;
    setPlace({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8)), top: up ? r.top - 4 : r.bottom + 4, width: Math.max(r.width, 180), up, maxHeight: Math.min(340, up ? above : below) });
  };
  useLayoutEffect(() => {
    if (open) measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // the list closes on a click elsewhere
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !list.current?.contains(t)) close(false);
    };
    const follow = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) measure();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // keep the highlighted option in view
  useEffect(() => {
    if (open && active >= 0) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        // like a closed select: typing picks a match straight away
        const hit = jump(e.key);
        if (hit !== undefined && options[hit].value !== value) onChange(options[hit].value);
      }
      return;
    }
    if (e.key === "ArrowDown") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
    else if (e.key === "Home") (e.preventDefault(), setActive(enabled[0] ?? -1));
    else if (e.key === "End") (e.preventDefault(), setActive(enabled[enabled.length - 1] ?? -1));
    else if (e.key === "PageDown") (e.preventDefault(), move(8));
    else if (e.key === "PageUp") (e.preventDefault(), move(-8));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), pick(active));
    else if (e.key === "Escape") (e.preventDefault(), close());
    else if (e.key === "Tab") close(false);
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) jump(e.key);
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        className={`select gselect ${className}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKey}
      >
        {current?.icon && <span className="gselectIcon">{current.icon}</span>}
        <span className={`gselectValue ${current ? "" : "gselectPlaceholder"}`}>{current?.label ?? placeholder}</span>
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={`gselectList ${place.up ? "gselectUp" : ""}`}
            style={{ left: place.left, top: place.top, minWidth: place.width, maxHeight: place.maxHeight }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => {
              const heading = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return [
                heading && (
                  <li key={`g:${heading}:${i}`} role="presentation" className="gselectGroup">
                    {heading}
                  </li>
                ),
                <li
                  key={`${o.value}:${i}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  className={`gselectOption ${i === active ? "gselectActive" : ""} ${o.value === value ? "gselectChosen" : ""}`}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onClick={() => pick(i)}
                >
                  {o.icon && <span className="gselectIcon">{o.icon}</span>}
                  <span className="gselectText">
                    <span>{o.label}</span>
                    {o.hint && <span className="gselectHint">{o.hint}</span>}
                  </span>
                  {o.value === value && (
                    <svg className="gselectTick" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </li>,
              ];
            })}
            {!options.length && <li className="gselectGroup">Nothing to choose from</li>}
          </ul>,
          // inside a modal dialog the list must be in it too, or the dialog's top layer covers it
          button.current?.closest("dialog[open]") ?? document.body,
        )}
    </>
  );
}
