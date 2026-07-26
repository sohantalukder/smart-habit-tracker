import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const source = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), 'utf8');

describe('Bloom mobile architecture', () => {
  it('keeps application, session, and sync state in Zustand', () => {
    const store = source('src/state/store.ts');
    const provider = source('src/app/AppProvider.tsx');

    expect(store).toContain("from 'zustand'");
    expect(store).toContain('createAppSlice');
    expect(provider).toContain('useStore');
    expect(provider).not.toContain('createContext');
  });

  it('uses TanStack mutations for the online authentication workflow', () => {
    const mutations = source('src/modules/auth/hooks/useAuthMutations.ts');
    const screen = source('src/screens/AuthScreen.tsx');

    expect(mutations).toContain("from '@tanstack/react-query'");
    expect(mutations).toContain('useMutation');
    expect(screen).toContain('useAuthMutations');
  });

  it('shares Bloom branding and typography with the web client', () => {
    const theme = source('src/theme/bloomTheme.ts');
    const logo = source('src/components/BloomLogo.tsx');
    const brandGenerator = source('scripts/generate-brand-assets.mjs');

    expect(theme).toContain("forest: '#15382F'");
    expect(theme).toContain("'Manrope_400Regular'");
    expect(theme).toContain("'Newsreader_500Medium'");
    expect(logo).toContain('M32 48C22 43');
    expect(brandGenerator).toContain('../client/public/icon.svg');
  });
});
