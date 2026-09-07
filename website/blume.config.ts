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

  deployment: {
    output: "static",
  },
});
