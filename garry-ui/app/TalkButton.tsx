"use client";

/** Sidebar trigger that opens the voice dock. The dock also listens for Cmd/Ctrl+K. */
export default function TalkButton() {
  return (
    <button className="talkButton" onClick={() => window.dispatchEvent(new Event("garry:voice"))}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0014 0M12 18v3" />
      </svg>
      Talk to Garry
      <kbd className="kbd">⌘K</kbd>
    </button>
  );
}
