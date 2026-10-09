import "./globals.css";
import type { ReactNode } from "react";

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
          <span className="tag">AI SDLC orchestrator</span>
        </header>
        {children}
      </body>
    </html>
  );
}
