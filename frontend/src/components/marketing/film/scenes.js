/* Each chapter's drawing, by its key. Vite only — the Node scripts read
   chapters.js and never need the pictures. */
const modules = import.meta.glob('./chapters/*/Scene.jsx', { eager: true });

export const SCENES = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [path.split('/')[2], mod]),
);
