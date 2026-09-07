import { defineConfig } from "blume";

export default defineConfig({
  title: "Fluidity",
  description:
    "Fluid UI scaling utilities for Tailwind CSS v4 — linear, exponential and logarithmic clamp-based scaling for every sizing and spacing utility.",
  logo: {
    text: "Fluidity",
  },

  content: {
    root: "docs",
  },

  theme: {
    accent: "#0090FF",
    radius: "md",
    mode: "system",
    fonts: {
      display: {
        provider: "fontsource",
        name: "Commissioner",
        fallback: "sans",
      },
      body: {
        provider: "fontsource",
        name: "Commissioner",
        fallback: "sans",
      },
      mono: {
        provider: "fontsource",
        name: "Monaspace Neon",
        fallback: "mono",
      },
    },
  },

  navigation: {
    sidebar: {
      display: "group",
    },
  },

  search: {
    provider: "orama",
  },

  markdown: {
    imageZoom: true,
    code: {
      icons: true,
    },
  },

  ai: {
    llmsTxt: true,
  },

  seo: {
    og: { enabled: true },
    sitemap: true,
    robots: true,
    structuredData: true,
  },

  // GitHub Pages project site: served from https://dnunez24.github.io under
  // the repository's own subdirectory, so every route and asset needs the
  // `/fluidity-tailwind` prefix. `site` is the bare origin -- Blume composes
  // the two for canonicals, the sitemap, robots, and OG images.
  deployment: {
    output: "static",
    site: "https://dnunez24.github.io",
    base: "/fluidity-tailwind",
  },
});
