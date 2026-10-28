import { Outlet } from "react-router";
import Link from "./lib/router";
import Nav from "./Nav";
import ProjectSwitcher from "./projects/ProjectSwitcher";
import ThemeToggle from "./ThemeToggle";
import VoiceDock from "./VoiceDock";
import TalkButton from "./TalkButton";
import ServerStatus from "./ServerStatus";
import GarryMark from "./GarryMark";

/** The app frame: sidebar, the current page, and the voice dock. */
export default function Shell() {
  return (
    <>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/" className="brand" aria-label="Garry home">
            <span className="brandMark"><GarryMark size={40} /></span>
            <span className="brandText">
              <span className="brandName">garry</span>
              <span className="brandSub">AI SDLC orchestrator</span>
            </span>
          </Link>
          <ProjectSwitcher />
          <Nav />
          <div className="sidebarFoot">
            <TalkButton />
            <div className="footRow">
              <ServerStatus />
              <ThemeToggle />
            </div>
          </div>
        </aside>
        <div className="content">
          <Outlet />
        </div>
      </div>
      <VoiceDock />
    </>
  );
}
