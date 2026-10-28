import { useEffect, useRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { syntaxHighlighting } from "@codemirror/language";
import { classHighlighter } from "@lezer/highlight";

function language(path: string): Extension {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "mts", "cts"].includes(ext)) return javascript({ typescript: true, jsx: ext === "tsx" });
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return javascript({ jsx: ext === "jsx" });
  if (ext === "json") return json();
  if (["css", "scss"].includes(ext)) return css();
  if (["html", "htm", "svg"].includes(ext)) return html();
  if (["md", "mdx"].includes(ext)) return markdown();
  if (["yml", "yaml"].includes(ext)) return yaml();
  return [];
}

// colors come from the dashboard's tokens, so it follows light and dark
const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "12.5px", backgroundColor: "var(--surface)", color: "var(--color-text-default)" },
  ".cm-scroller": { fontFamily: "var(--font-family-mono)", lineHeight: "1.55" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--color-text-muted)", borderRight: "1px solid var(--border)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--color-text-default) 5%, transparent)" },
  ".cm-cursor": { borderLeftColor: "var(--color-text-default)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)" },
  "&.cm-focused": { outline: "none" },
});

/** A code editor for one file. Cmd/Ctrl+S calls onSave. */
export default function CodeEditor({ path, value, readOnly, onChange, onSave }: { path: string; value: string; readOnly: boolean; onChange: (v: string) => void; onSave: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  // the latest callbacks, so the editor is not rebuilt on every render
  const cb = useRef({ onChange, onSave });
  cb.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab, { key: "Mod-s", preventDefault: true, run: () => (cb.current.onSave(), true) }]),
          language(path),
          // tok-* classes, coloured in globals.css for light and dark
          syntaxHighlighting(classHighlighter),
          theme,
          editable.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.updateListener.of((u) => u.docChanged && cb.current.onChange(u.state.doc.toString())),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // a new file is a new editor; value changes from outside are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);

  return <div ref={host} style={{ height: "100%", minHeight: 0 }} />;
}
