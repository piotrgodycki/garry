import "./globals.css";
import type { ReactNode } from "react";
import Nav from "./Nav";
import ThemeToggle from "./ThemeToggle";

export const metadata = {
  title: "Garry",
  description: "AI SDLC orchestrator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brandTop">
                <span className="logoTile">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="logoMark" src="/garry-mark.svg" alt="" />
                </span>
                <span className="brandName">Garry</span>
              </div>
              <span className="brandSub">AI SDLC orchestrator</span>
            </div>
            <Nav />
            <div className="sidebarFoot">
              <ThemeToggle />
            </div>
          </aside>
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  );
}
