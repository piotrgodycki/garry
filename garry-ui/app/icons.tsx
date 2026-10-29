import type { ReactNode } from "react";

/**
 * Garry's own icon set: 24px grid, 1.7 stroke, round ends, so every screen
 * speaks the same visual language. A few carry the brand: an agent is a worm's
 * head, Build is lanes of work with agents at their ends, ideas sprout.
 */
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  dashboard: svg(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  agent: svg(<><ellipse cx="12" cy="13" rx="7" ry="7.5" /><path d="M5.6 16.5q6.4 3.4 12.8 0" /><circle cx="9.6" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="14.4" cy="12" r="1" fill="currentColor" stroke="none" /></>),
  registry: svg(<path d="M20.5 8L12 3.5 3.5 8 12 12.5 20.5 8zM3.5 8v8L12 20.5 20.5 16V8M12 12.5v8" />),
  skills: svg(<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12l1-8z" />),
  routing: svg(<><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M8.2 6H11a3 3 0 013 3v0a3 3 0 003 3M8.2 18H11a3 3 0 003-3v0a3 3 0 013-3" /></>),
  prs: svg(<><circle cx="6.5" cy="6" r="2.2" /><circle cx="6.5" cy="18" r="2.2" /><circle cx="17.5" cy="18" r="2.2" /><path d="M6.5 8.2v7.6M17.5 15.8V10a3 3 0 00-3-3h-3.2m0 0l2-2m-2 2l2 2" /></>),
  puzzle: svg(<path d="M10 3h4v2.5a1.5 1.5 0 003 0V3h4v7h-2.5a1.5 1.5 0 000 3H21v8h-7v-2.5a1.5 1.5 0 00-3 0V21H3v-8h2.5a1.5 1.5 0 000-3H3V3z" />),
  stack: svg(<><path d="M12 3l9 4.5-9 4.5-9-4.5z" /><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5" /></>),
  code: svg(<><path d="M4 7h8M4 12h12M4 17h5" /><circle cx="15" cy="7" r="1.7" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none" /><circle cx="12" cy="17" r="1.7" fill="currentColor" stroke="none" /></>),
  folder: svg(<path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />),
  terminal: svg(<><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5" /></>),
  mic: svg(<><rect x="9" y="3.5" width="6" height="10.5" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V20.5" /></>),
  send: svg(<path d="M5 12h14M13 6l6 6-6 6" />),
  close: svg(<path d="M6 6l12 12M18 6L6 18" />),
  menu: svg(<path d="M4 7h16M4 12h16M4 17h16" />),
  back: svg(<path d="M15 6l-6 6 6 6" />),
  chevron: svg(<path d="M9 6l6 6-6 6" />),
  external: svg(<path d="M7 17L17 7M9 7h8v8" />),
  search: svg(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></>),
  moon: svg(<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />),
  monitor: svg(<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>),
  idea: svg(<><path d="M12 20v-7.5" /><path d="M12 13.5C8 13.5 6 11 6 7.5c4 0 6 2.5 6 6zM12 11.5c0-3.5 2-6 6-6 0 3.5-2 6-6 6z" /><path d="M6.5 20h11" /></>),
  bolt: svg(<path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12l1-8z" />),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  settings: svg(<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>),
  service: svg(<><path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" /><path d="M4 7.4l8 4.6 8-4.6M12 12v9.2" /></>),
  alert: svg(<><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.2v.1" /></>),
  stop: svg(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />),
  link: svg(<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />),
  inbox: svg(<><path d="M3 13l2.5-7.5A2 2 0 017.4 4h9.2a2 2 0 011.9 1.5L21 13v5a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M3 13h5l1.5 2.5h5L16 13h5" /></>),
  github: (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
} as const;
