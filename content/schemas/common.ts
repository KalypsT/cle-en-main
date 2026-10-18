import { z } from 'zod';

/** Amount in euros as written by hand; the engine converts to integer cents. */
export const euros = z.number().min(0);
/** A share between 0 and 1 (0.35 = 35 %). */
export const share = z.number().min(0).max(1);
/** A rate in percentage points (3.65 = 3,65 %). */
export const percent = z.number();
export const id = z.string().regex(/^[a-z][a-zA-Z0-9]*$/);
export const trust = z.number().min(0).max(100);
