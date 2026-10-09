import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = {
  title: "Garry",
  description: "AI SDLC orchestrator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="hdr">
          <span className="logo">GARRY</span>
          <nav className="nav">
            <Link href="/">Dashboard</Link>
            <Link href="/registry">Registry</Link>
            <Link href="/skills">Skills</Link>
            <Link href="/routing">Routing</Link>
            <Link href="/github">GitHub</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
