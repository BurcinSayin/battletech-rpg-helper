export {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_BASE,
  CHARACTER_START_XP,
  attributeXp,
  computeXp,
  sumRows,
  type AttributeKey,
  type XpSummary,
} from "./xp";
export {
  rowToDraft,
  draftToColumns,
  draftToPayload,
  draftToInsert,
} from "./mapping";
export type {
  CharacterColumns,
  CharacterInfo,
  CharacterRow,
  PreSnapshot,
} from "./types";
export {
  characterFormSchema,
  scalarsSchema,
  attributesSchema,
  draftToForm,
  formToDraft,
  catalogWarnings,
  catalogSkillNames,
  catalogTraitNames,
  type CharacterFormValues,
  type CatalogWarnings,
} from "./schema";
export {
  classifyUpdateError,
  type UpdateErrorKind,
  type RpcErrorLike,
} from "./errors";
export {
  prepareImport,
  looksLikeCharacter,
  normalizeImportName,
  IMPORT_FALLBACK_NAME,
  NAME_MAX_LENGTH,
  type PrepareImportResult,
} from "./import";
export {
  mergePrerequisites,
  checkPrerequisites,
  type PrerequisiteSet,
  type MergedPrerequisiteSet,
  type PrerequisiteReport,
  type UnmetPrerequisite,
} from "./prereq";
export {
  availableChildhoodModules,
  resolveChildhoodModule,
  applyChildhoodModule,
  type ChildhoodContext,
  type ChildhoodSelection,
  type ChildhoodResolution,
  type ChildhoodFailureReason,
  type ResolvedChildhoodModule,
} from "./childhood";
export {
  resolveSibkoFields,
  type SibkoSelection,
  type SibkoFieldSelection,
  type SibkoFieldsResult,
} from "./sibko";
export {
  flexCandidates,
  validateFlexAllocations,
  applyFlexAllocations,
  type FlexAllocation,
  type FlexValidation,
} from "./flex-xp";
export {
  availableSchools,
  availableRealLife,
  resolveAdultModule,
  schoolChoices,
  fieldChoices,
  validAdultChoices,
  completeAdultChoices,
  applyAdultModule,
  type AdultContext,
  type AdultChoice,
  type AdultChoiceSelection,
} from "./adult";
export {
  projectSchool,
  type SchoolSelection,
  type SchoolFieldSelection,
  type SchoolTier,
  type SchoolView,
  type RealLifeSelection,
  type ResolvedRealLife,
} from "./school";

export { realLifeChoices, applyRealLifeChoices } from "./real-life-choices";
