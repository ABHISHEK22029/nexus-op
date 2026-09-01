/* ══════════════════════════════════════════════════════════
   navResources — kept as a re-export so existing imports keep working.

   The path→permission map moved into lib/navigation.js, which also owns the
   rail-and-panel structure. They were separate files describing the same
   thing, and the nav is exactly where a second copy does damage: it starts
   advertising a page the guard refuses, or hiding one it allows.
   ══════════════════════════════════════════════════════════ */
export {
  PATH_RESOURCES, UNGATED_PATHS, ADMIN_ONLY_PATHS,
  resourceForPath, isAdminOnlyPath,
} from './navigation';
