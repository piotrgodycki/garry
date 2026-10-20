import type { MetadataRoute } from "next";

// Lets a phone or tablet install Garry from the browser ("Add to Home Screen") and
// open it full screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Garry",
    short_name: "Garry",
    description: "AI SDLC orchestrator",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
