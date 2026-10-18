import { z } from 'zod';
import { MOMENTS } from './world.ts';

/** The four music slots (docs/05, 5.8). */
export const MUSIC_SLOTS = ['day', 'evening', 'night', 'celebration'] as const;

/** A track file: an MP3 or OGG loop under apps/game/public/<folder>/<slot>/. */
const track = z.string().regex(/^[\w .()'-]+\.(mp3|ogg)$/i, 'Un fichier MP3 ou OGG.');

/**
 * Music provided by Thibaud (content/musique.json): each slot may hold
 * several tracks, or none (the game then plays no music in that slot).
 */
export const musicSchema = z
  .object({
    /** Folder of the tracks in the built game (served offline by the service worker). */
    folder: z.string().regex(/^[a-z0-9-]+$/),
    slots: z.record(z.enum(MUSIC_SLOTS), z.array(track)),
    /** Slot of each moment of the day; the celebrations play over it. */
    slotByMoment: z.record(z.enum(MOMENTS), z.enum(MUSIC_SLOTS)),
    /** Fade between two tracks, in seconds. */
    crossfadeSeconds: z.number().min(0).max(20),
  })
  .strict();

export type Music = z.infer<typeof musicSchema>;
export type MusicSlot = (typeof MUSIC_SLOTS)[number];
