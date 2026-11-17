/**
 * Review 8.1: picking a language in Settings switched the UI but did not remember
 * it, so the next launch (or any reload) was back in the old language.
 * @critical
 */
import { act, renderHook } from '@testing-library/react';
import i18n from '@/i18n';

jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'u1' }) }));
jest.mock('@/contexts/ModalProvider', () => ({
  useModalContext: () => ({ isAppResetting: false, setIsAppResetting: jest.fn() }),
}));
jest.mock('@/utils/appSettings', () => ({
  ...jest.requireActual('@/utils/appSettings'),
  updateAppSettings: jest.fn().mockResolvedValue(undefined),
  getLastHomeTeamName: jest.fn().mockResolvedValue(''),
}));

import { useAppSettingsController } from '../useAppSettingsController';

describe('Settings language choice', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('is remembered on the device', async () => {
    const { result } = renderHook(() => useAppSettingsController());
    await act(async () => {});
    act(() => result.current.setAppLanguage('fi'));
    expect(i18n.language).toBe('fi');
    expect(localStorage.getItem('matchops_language')).toBe('fi');
  });
});
