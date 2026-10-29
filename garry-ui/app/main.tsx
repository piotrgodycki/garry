import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router";
// IBM Plex, bundled: the dashboard and the Mac app work offline
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import Shell from "./layout";
import Dashboard from "./page";
import Registry from "./registry/page";
import Stacks from "./stacks/page";
import ArchitecturePage from "./architecture/page";
import Skills from "./skills/page";
import Routing from "./routing/page";
import Prs from "./github/page";
import Activity from "./pipeline/[id]/page";
import ServicePage from "./service/[name]/page";
import Pair from "./pair/page";
import Build from "./build/page";
import Live from "./live/page";
import ThreadView from "./build/thread";
import Settings from "./settings/page";
import Files from "./files/page";
import { Empty } from "./ui";

/** An old link to Live agents opens the feature pipeline in Build, the same feature picked. */
function AgentRedirect() {
  const feature = new URLSearchParams(useLocation().search).get("feature");
  return <Navigate replace to={`/build?view=pipeline${feature ? `&feature=${encodeURIComponent(feature)}` : ""}`} />;
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Dashboard /> },
      // Live agents now lives in Build, as the feature pipeline
      { path: "/agent", element: <AgentRedirect /> },
      { path: "/registry", element: <Registry /> },
      { path: "/stacks", element: <Stacks /> },
      { path: "/architecture", element: <ArchitecturePage /> },
      { path: "/skills", element: <Skills /> },
      { path: "/routing", element: <Routing /> },
      { path: "/github", element: <Prs /> },
      { path: "/pipeline/:id", element: <Activity /> },
      { path: "/service/:name", element: <ServicePage /> },
      { path: "/live", element: <Live /> },
      { path: "/build", element: <Build /> },
      { path: "/build/:id", element: <ThreadView /> },
      { path: "/files", element: <Files /> },
      { path: "/pair", element: <Pair /> },
      { path: "/settings", element: <Settings /> },
      { path: "*", element: <main className="page"><Empty>Page not found.</Empty></main> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
