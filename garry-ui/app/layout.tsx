import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import Link from "./lib/router";
import Nav from "./Nav";
import ProjectSwitcher from "./projects/ProjectSwitcher";
import ThemeToggle from "./ThemeToggle";
import VoiceDock from "./VoiceDock";
import TalkButton from "./TalkButton";
import ServerStatus from "./ServerStatus";
import GarryMark from "./GarryMark";
import { Icon } from "./icons";

/**
 * The app frame: the sidebar, the current page, and the voice dock. On a wide
 * screen the sidebar stays put; on a tablet or phone it folds into a top bar
 * (menu, project, talk) and the menu slides in as a drawer.
 */
export default function Shell() {
  const [menu, setMenu] = useState(false);
  const { pathname, search } = useLocation();
  // a link in the drawer was followed: put the drawer away
  useEffect(() => setMenu(false), [pathname, search]);
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [menu]);

  return (
    <>
      <div className={`shell${menu ? " menuOpen" : ""}`}>
        <aside className="sidebar">
          <div className="sidebarTop">
            <button className="menuButton" aria-label={menu ? "close menu" : "open menu"} aria-expanded={menu} aria-controls="garry-menu" onClick={() => setMenu((m) => !m)}>
              {menu ? Icon.close : Icon.menu}
            </button>
            <Link href="/" className="brand" aria-label="Garry home">
              <span className="brandMark"><GarryMark size={40} /></span>
              <span className="brandText">
                <span className="brandName">garry</span>
                <span className="brandSub">AI SDLC orchestrator</span>
              </span>
            </Link>
            <ProjectSwitcher />
            <span className="talkTop">
              <TalkButton />
            </span>
          </div>
          <div className="sidebarMenu" id="garry-menu">
            <Nav />
            <div className="sidebarFoot">
              <TalkButton />
              <div className="footRow">
                <ServerStatus />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </aside>
        {menu && <div className="scrim" aria-hidden="true" onClick={() => setMenu(false)} />}
        <div className="content">
          <Outlet />
        </div>
      </div>
      <VoiceDock />
    </>
  );
}
