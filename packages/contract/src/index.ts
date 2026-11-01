/**
 * Types generated from openapi.yaml. Both the API and the web app import their wire
 * types from here, so a contract change surfaces as a type error on both sides.
 */
import type { components } from './generated/schema.js';

export type { components, operations, paths } from './generated/schema.js';

type Schemas = components['schemas'];

export type Problem = Schemas['Problem'];
export type User = Schemas['User'];
export type ImportJob = Schemas['ImportJob'];
export type CollectionPage = Schemas['CollectionPage'];
export type CollectionRefresh = Schemas['CollectionRefresh'];
export type CollectionItem = Schemas['CollectionItem'];
export type ReleaseSummary = Schemas['ReleaseSummary'];
export type Release = Schemas['Release'];
export type LoginErrorCode = Schemas['LoginErrorCode'];
export type SearchPage = Schemas['SearchPage'];
export type SearchResult = Schemas['SearchResult'];
export type ReleasePreviews = Schemas['ReleasePreviews'];
export type CollectionFacets = Schemas['CollectionFacets'];
export type WantlistPage = Schemas['WantlistPage'];
export type WantlistItem = Schemas['WantlistItem'];
export type TasteRecommendations = Schemas['TasteRecommendations'];
export type TasteRoom = Schemas['TasteRoom'];
export type TastePick = Schemas['TastePick'];
export type CatalogueMaster = Schemas['CatalogueMaster'];
export type TasteReason = Schemas['TasteReason'];
export type TasteFeedback = Schemas['TasteFeedback'];
export type TasteLink = Schemas['TasteLink'];
export type TasteSearch = Schemas['TasteSearch'];
