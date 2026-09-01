import type { MetadataRoute } from "next";

// Web app manifest. Icons are code-rendered route handlers (app/icons/*), so there
// are no binary assets in public/. `type` declares the format — manifest icon URLs
// need no file extension, and Chrome resolves them by Content-Type.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BattleTech RPG Helper",
    short_name: "BT Helper",
    description:
      "Create and manage A Time of War characters — cloud save, GM oversight, .btcc import/export.",
    // "/" redirects to /dashboard, which sends signed-out users to /login, so an
    // installed launch resolves correctly in both states.
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/512-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
