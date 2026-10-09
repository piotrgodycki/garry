import "./globals.css";
import type { ReactNode } from "react";
import Nav from "./Nav";

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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo" src="/garry-logo.svg" alt="Garry" />
              <span className="brandSub">AI SDLC orchestrator</span>
            </div>
            <Nav />
          </aside>
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  );
}
