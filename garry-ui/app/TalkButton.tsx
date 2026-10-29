import { Icon } from "./icons";

/** Sidebar trigger that opens the voice dock. The dock also listens for Cmd/Ctrl+J. */
export default function TalkButton() {
  return (
    <button className="talkButton" onClick={() => window.dispatchEvent(new Event("garry:voice"))} aria-label="talk to Garry">
      {Icon.mic}
      <span className="talkLabel">Talk to Garry</span>
      <kbd className="kbd">⌘J</kbd>
    </button>
  );
}
