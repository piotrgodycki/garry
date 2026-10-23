import { Icon } from "./icons";

/** Sidebar trigger that opens the voice dock. The dock also listens for Cmd/Ctrl+K. */
export default function TalkButton() {
  return (
    <button className="talkButton" onClick={() => window.dispatchEvent(new Event("garry:voice"))} aria-label="talk to Garry">
      {Icon.mic}
      <span className="talkLabel">Talk to Garry</span>
      <kbd className="kbd">⌘K</kbd>
    </button>
  );
}
