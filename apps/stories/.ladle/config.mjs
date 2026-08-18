/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: "src/**/*.stories.tsx",
  viteConfig: new URL("../vite.config.ts", import.meta.url).pathname,
  defaultStory: "editor--playground",
  addons: {
    a11y: { enabled: true },
    theme: { enabled: true, defaultState: "dark" },
    width: {
      enabled: true,
      options: { phone: 390, tablet: 768, desktop: 1280 },
      defaultState: 0,
    },
    mode: { enabled: true, defaultState: "full" },
    source: { enabled: true },
    rtl: { enabled: false },
    ladle: { enabled: false },
  },
};
