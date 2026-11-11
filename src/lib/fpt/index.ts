// Flow Production Tracking: the mapping and the sync transport. See README.md.

export { createFptTransport, type FptTransportOptions } from './transport';
export { checkSetup, type FieldReport, type SetupReport } from './setup';
export { memoryKeyValue, storageKeyValue, type KeyValue } from './cache';
export type { FptOptions } from './api';
export type { EntityResolution, Resolution } from './schema';
export { ENTITY_SCOPES, ENTITY_TYPES, mappingTable, type EntityScope } from './mapping';
