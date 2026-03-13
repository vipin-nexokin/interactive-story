/** @type {import('vite').UserConfig} */
module.exports = {
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2019",
  },
};
