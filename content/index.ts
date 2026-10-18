import jobsJson from './metiers.json' with { type: 'json' };
import timeJson from './temps.json' with { type: 'json' };
import uiTextsJson from './textes/interface.json' with { type: 'json' };
import { jobsFileSchema } from './schemas/jobs.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';

export type { Job, JobsFile } from './schemas/jobs.ts';
export type { TimeSettings } from './schemas/time.ts';
export type { UiTexts } from './schemas/ui-texts.ts';
export { jobsFileSchema, timeSettingsSchema, uiTextsSchema };

export const jobs = jobsFileSchema.parse(jobsJson).jobs;
export const timeSettings = timeSettingsSchema.parse(timeJson);
export const uiTexts = uiTextsSchema.parse(uiTextsJson);
