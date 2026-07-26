import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bloom — Smart Habit Tracker",
    short_name: "Bloom",
    description: "A disciplined, private habit practice built for real life.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3efe4",
    theme_color: "#15382f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
