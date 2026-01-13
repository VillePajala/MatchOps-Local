export { LocalDataStore } from './LocalDataStore';
export {
  getDataStore,
  getAuthService,
  resetFactory,
  isDataStoreInitialized,
  isAuthServiceInitialized,
} from './factory';

// Backend configuration utilities
export {
  getBackendMode,
  getBackendConfig,
  isCloudAvailable,
  enableCloudMode,
  disableCloudMode,
  clearModeOverride,
  hasModeOverride,
  getSupabaseUrl,
  getSupabaseAnonKey,
  type BackendMode,
  type BackendConfig,
} from '@/config/backendConfig';
