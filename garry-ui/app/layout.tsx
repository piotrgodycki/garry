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
        <header className="hdr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/garry-logo.svg" alt="Garry" height={30} />
          <Nav />
        </header>
        {children}
      </body>
    </html>
  );
}
