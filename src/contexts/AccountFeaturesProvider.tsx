'use client';

import React, { createContext, useContext } from 'react';
import { useAccountFeatures, type AccountFeature } from '@/hooks/useAccountFeatures';

/**
 * The signed-in account's server-side feature flags for components deep in
 * the tree (forms and modals) that should not need the auth context
 * themselves. Mounted once inside AuthProvider; outside it (a component
 * rendered on its own, e.g. in its tests) every feature reads as off.
 */
const FeatureCheckContext = createContext<(feature: AccountFeature) => boolean>(() => false);

export function AccountFeaturesProvider({ children }: { children: React.ReactNode }) {
  const { hasFeature } = useAccountFeatures();
  return <FeatureCheckContext.Provider value={hasFeature}>{children}</FeatureCheckContext.Provider>;
}

/** Whether the account has this feature (false outside AccountFeaturesProvider). */
export function useFeatureEnabled(feature: AccountFeature): boolean {
  return useContext(FeatureCheckContext)(feature);
}
