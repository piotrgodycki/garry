import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./globals.css";
import Shell from "./layout";
import Dashboard from "./page";
import AgentView from "./agent/page";
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
import ThreadView from "./build/thread";
import Settings from "./settings/page";
import { Empty } from "./ui";

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/agent", element: <AgentView /> },
      { path: "/registry", element: <Registry /> },
      { path: "/stacks", element: <Stacks /> },
      { path: "/architecture", element: <ArchitecturePage /> },
      { path: "/skills", element: <Skills /> },
      { path: "/routing", element: <Routing /> },
      { path: "/github", element: <Prs /> },
      { path: "/pipeline/:id", element: <Activity /> },
      { path: "/service/:name", element: <ServicePage /> },
      { path: "/build", element: <Build /> },
      { path: "/build/:id", element: <ThreadView /> },
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
