import banksJson from './banques.json' with { type: 'json' };
import besanconJson from '../data/cities/besancon.json' with { type: 'json' };
import chalonJson from '../data/cities/chalon.json' with { type: 'json' };
import dijonJson from '../data/cities/dijon.json' with { type: 'json' };
import doleJson from '../data/cities/dole.json' with { type: 'json' };
import creditJson from './credit.json' with { type: 'json' };
import decisionsJson from './decisions.json' with { type: 'json' };
import taxesJson from './fiscalite.json' with { type: 'json' };
import marketJson from './marche.json' with { type: 'json' };
import jobsJson from './metiers.json' with { type: 'json' };
import startJson from './partie.json' with { type: 'json' };
import rentingJson from './location.json' with { type: 'json' };
import rivalsJson from './rivaux.json' with { type: 'json' };
import marketRateJson from './taux.json' with { type: 'json' };
import timeJson from './temps.json' with { type: 'json' };
import listingTextsJson from './textes/annonces.json' with { type: 'json' };
import tenantTextsJson from './textes/locataires.json' with { type: 'json' };
import uiTextsJson from './textes/interface.json' with { type: 'json' };
import screenTextsJson from './textes/ecrans.json' with { type: 'json' };
import tutorialJson from './textes/didacticiel.json' with { type: 'json' };
import livingCostsJson from './train-de-vie.json' with { type: 'json' };
import artisansJson from './artisans.json' with { type: 'json' };
import worksJson from './travaux.json' with { type: 'json' };
import worksTextsJson from './textes/travaux.json' with { type: 'json' };
import worldJson from './monde.json' with { type: 'json' };
import musicJson from './musique.json' with { type: 'json' };
import modesJson from './modes.json' with { type: 'json' };
import calendarJson from './calendrier.json' with { type: 'json' };
import rhythmJson from './rythme.json' with { type: 'json' };
import progressionJson from './progression.json' with { type: 'json' };
import titlesJson from './titres.json' with { type: 'json' };
import citiesRulesJson from './villes.json' with { type: 'json' };
import achievementsJson from './succes.json' with { type: 'json' };
import challengesJson from './defis.json' with { type: 'json' };
import anecdotesJson from './anecdotes.json' with { type: 'json' };
import yvonJson from './textes/yvon.json' with { type: 'json' };
import marketEventsJson from './evenements/marche.json' with { type: 'json' };
import tenantEventsJson from './evenements/locataires.json' with { type: 'json' };
import artisanEventsJson from './evenements/artisans.json' with { type: 'json' };
import bankEventsJson from './evenements/banque.json' with { type: 'json' };
import coproEventsJson from './evenements/copropriete.json' with { type: 'json' };
import cityEventsJson from './evenements/ville.json' with { type: 'json' };
import franceEventsJson from './evenements/france.json' with { type: 'json' };
import { checkReferences, type GameContent } from './references.ts';
import { cityDataSchema } from './schemas/city.ts';
import { decisionRulesSchema } from './schemas/decisions.ts';
import { banksFileSchema, creditRulesSchema, marketRateSchema } from './schemas/credit.ts';
import { jobsFileSchema } from './schemas/jobs.ts';
import { listingTextsSchema, marketRulesSchema } from './schemas/market.ts';
import { rentingRulesSchema, tenantTextsSchema } from './schemas/renting.ts';
import { rivalsFileSchema } from './schemas/rivals.ts';
import { screenTextsSchema, tutorialSchema } from './schemas/screens.ts';
import { livingCostsSchema, startSchema } from './schemas/start.ts';
import { taxRulesSchema } from './schemas/taxes.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';
import { artisansFileSchema, worksRulesSchema, worksTextsSchema } from './schemas/works.ts';
import { musicSchema } from './schemas/music.ts';
import { citiesRulesSchema } from './schemas/villes.ts';
import { worldRulesSchema } from './schemas/world.ts';
import { anecdotesFileSchema, eventsFileSchema, rhythmRulesSchema } from './schemas/events.ts';
import { calendarRulesSchema, modesFileSchema } from './schemas/modes.ts';
import {
  achievementsFileSchema,
  challengesFileSchema,
  progressionRulesSchema,
  titlesFileSchema,
  yvonTextsSchema,
} from './schemas/progression.ts';

export type { GameContent } from './references.ts';
export type { Bank, CreditRules, MarketRate } from './schemas/credit.ts';
export type { CityData, DpeLabel, DwellingKind, Epoch, NeighbourhoodData } from './schemas/city.ts';
export { DPE_LABELS, EPOCHS } from './schemas/city.ts';
export type { Job, JobsFile } from './schemas/jobs.ts';
export type {
  Condition,
  DefectRule,
  ListingTexts,
  MarketRules,
  Motivation,
} from './schemas/market.ts';
export { CONDITIONS } from './schemas/market.ts';
export type {
  Agency,
  Contract,
  IncidentRule,
  LeaseType,
  LifeEventRule,
  RentingRules,
  TenantProfile,
  TenantTexts,
} from './schemas/renting.ts';
export { CONTRACTS, LEASE_TYPES } from './schemas/renting.ts';
export type { TaxRules } from './schemas/taxes.ts';
export type { DecisionKind, DecisionRules } from './schemas/decisions.ts';
export { DECISION_KINDS } from './schemas/decisions.ts';
export type { Rival, RivalsFile } from './schemas/rivals.ts';
export type { LivingCosts, Start } from './schemas/start.ts';
export type { TimeSettings } from './schemas/time.ts';
export type { UiTexts } from './schemas/ui-texts.ts';
export type { Tutorial, TutorialTrigger } from './schemas/screens.ts';
export { TUTORIAL_TRIGGERS } from './schemas/screens.ts';
export type {
  Artisan,
  HazardRule,
  ItemKind,
  ItemRule,
  ResolutionRule,
  SpaceKind,
  Tier,
  Trade,
  WorksRules,
  WorksTexts,
} from './schemas/works.ts';
export { ITEM_KINDS, SPACE_KINDS, TIERS, TRADES } from './schemas/works.ts';
export type { Moment, Season, Weather, WorldRules } from './schemas/world.ts';
export { MOMENTS, SEASONS, WEATHERS } from './schemas/world.ts';
export type { Music, MusicSlot } from './schemas/music.ts';
export { MUSIC_SLOTS } from './schemas/music.ts';
export type {
  Anecdote,
  CatalogEvent,
  EventChoice,
  EventConditions,
  EventEffect,
  EventFamily,
  EventTarget,
  RhythmRules,
} from './schemas/events.ts';
export { ANECDOTE_SPEAKERS, EVENT_FAMILIES, EVENT_TARGETS } from './schemas/events.ts';
export type { CalendarRules, Mode, ModesFile } from './schemas/modes.ts';
export type {
  Achievement,
  AdviceKind,
  Challenge,
  ChallengeGiver,
  ChallengesFile,
  ProgressionRules,
  Stat,
  StatCondition,
  Title,
  YvonTexts,
} from './schemas/progression.ts';
export { ADVICE_KINDS, CHALLENGE_GIVERS, KEYED_STATS, STATS } from './schemas/progression.ts';
export { checkReferences };

const jobsFile = jobsFileSchema.parse(jobsJson);
const rivalsFile = rivalsFileSchema.parse(rivalsJson);
const artisansFile = artisansFileSchema.parse(artisansJson);

/** Gameplay content handed to the engine. */
export const gameContent: GameContent = {
  start: startSchema.parse(startJson),
  livingCosts: livingCostsSchema.parse(livingCostsJson),
  jobs: jobsFile.jobs,
  unemployedFreeTimeMinutes: jobsFile.unemployedFreeTimeMinutes,
  credit: creditRulesSchema.parse(creditJson),
  banks: banksFileSchema.parse(banksJson).banks,
  marketRate: marketRateSchema.parse(marketRateJson),
  market: marketRulesSchema.parse(marketJson),
  listingTexts: listingTextsSchema.parse(listingTextsJson),
  renting: rentingRulesSchema.parse(rentingJson),
  tenantTexts: tenantTextsSchema.parse(tenantTextsJson),
  taxes: taxRulesSchema.parse(taxesJson),
  rivalRules: rivalsFile.aggressiveness,
  rivals: rivalsFile.rivals,
  works: worksRulesSchema.parse(worksJson),
  trades: artisansFile.trades,
  artisans: artisansFile.artisans,
  worksTexts: worksTextsSchema.parse(worksTextsJson),
  decisions: decisionRulesSchema.parse(decisionsJson),
  world: worldRulesSchema.parse(worldJson),
  modes: modesFileSchema.parse(modesJson),
  calendar: calendarRulesSchema.parse(calendarJson),
  rhythm: rhythmRulesSchema.parse(rhythmJson),
  progression: progressionRulesSchema.parse(progressionJson),
  titles: titlesFileSchema.parse(titlesJson).titles,
  achievements: achievementsFileSchema.parse(achievementsJson).achievements,
  challenges: challengesFileSchema.parse(challengesJson),
  events: [
    marketEventsJson,
    tenantEventsJson,
    artisanEventsJson,
    bankEventsJson,
    coproEventsJson,
    cityEventsJson,
    franceEventsJson,
  ].flatMap((file) => eventsFileSchema.parse(file).events),
  anecdotes: anecdotesFileSchema.parse(anecdotesJson).anecdotes,
  yvon: yvonTextsSchema.parse(yvonJson),
  citiesRules: citiesRulesSchema.parse(citiesRulesJson),
  cities: {
    dole: cityDataSchema.parse(doleJson),
    dijon: cityDataSchema.parse(dijonJson),
    besancon: cityDataSchema.parse(besanconJson),
    chalon: cityDataSchema.parse(chalonJson),
  },
};

const referenceProblems = checkReferences(gameContent);
if (referenceProblems.length > 0) {
  throw new Error(`Invalid content references:\n${referenceProblems.join('\n')}`);
}

export const jobs = gameContent.jobs;
export const timeSettings = timeSettingsSchema.parse(timeJson);
export const uiTexts = uiTextsSchema.parse(uiTextsJson);
/** Music slots (interface only: the engine never plays sound). */
export const music = musicSchema.parse(musicJson);

screenTextsSchema.parse(screenTextsJson);
/** Texts of the management screens, typed by the file itself. */
export const screenTexts: typeof screenTextsJson = screenTextsJson;
export const tutorial = tutorialSchema.parse(tutorialJson);
