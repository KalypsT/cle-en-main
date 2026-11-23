/**
 * The game is built for DomoThib Games (`vite build --mode domothib`, docs/domothib.md):
 * no PWA, the bridge to DomoThib at launch, the saves on its server.
 */
export const DOMOTHIB_BUILD = import.meta.env.MODE === 'domothib';

/**
 * Files can be downloaded (export of a game, of the log): not in DomoThib Games, whose frame
 * does not allow downloads. Importing a game file still works there.
 */
export const CAN_DOWNLOAD = !DOMOTHIB_BUILD;
