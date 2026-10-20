import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import Nav from "./Nav";
import ThemeToggle from "./ThemeToggle";
import VoiceDock from "./VoiceDock";
import TalkButton from "./TalkButton";
import ServerStatus from "./ServerStatus";
import GarryMark from "./GarryMark";
import AccessGate from "./AccessGate";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // lets the layout reach under the notch and home bar; the CSS pads with safe-area insets
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata = {
  title: { default: "Garry", template: "%s · Garry" },
  description: "AI SDLC orchestrator",
  applicationName: "Garry",
  // installed on a phone home screen, Garry opens full screen like an app
  appleWebApp: { capable: true, title: "Garry", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

// Applies the stored theme before first paint so there is no light flash on a dark choice.
const themeScript = `try{var t=localStorage.getItem("garry-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand" aria-label="Garry home">
              <span className="brandMark"><GarryMark size={40} /></span>
              <span className="brandText">
                <span className="brandName">garry</span>
                <span className="brandSub">AI SDLC orchestrator</span>
              </span>
            </Link>
            <Nav />
            <div className="sidebarFoot">
              <TalkButton />
              <div className="footRow">
                <ServerStatus />
                <ThemeToggle />
              </div>
            </div>
          </aside>
          <div className="content">{children}</div>
        </div>
        <VoiceDock />
        <AccessGate />
      </body>
    </html>
  );
}
