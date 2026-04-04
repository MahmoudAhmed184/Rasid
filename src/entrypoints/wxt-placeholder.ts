import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

// WXT requires at least one file under src/entrypoints even though this project
// ships its real runtime from public/. The emitted bundle is pruned in
// wxt.config.ts so it never ships as a dead artifact.
export default defineUnlistedScript(() => {});
