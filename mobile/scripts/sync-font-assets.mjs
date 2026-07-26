import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const fontDirectory = path.join(mobileRoot, 'assets/fonts');
const fonts = [
  [
    '@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf',
    'Manrope_400Regular.ttf',
  ],
  [
    '@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf',
    'Manrope_500Medium.ttf',
  ],
  [
    '@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf',
    'Manrope_600SemiBold.ttf',
  ],
  [
    '@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf',
    'Manrope_700Bold.ttf',
  ],
  [
    '@expo-google-fonts/newsreader/500Medium/Newsreader_500Medium.ttf',
    'Newsreader_500Medium.ttf',
  ],
  [
    '@expo-google-fonts/newsreader/500Medium_Italic/Newsreader_500Medium_Italic.ttf',
    'Newsreader_500Medium_Italic.ttf',
  ],
];

await mkdir(fontDirectory, { recursive: true });
await Promise.all(
  fonts.map(([source, filename]) =>
    copyFile(
      path.join(mobileRoot, 'node_modules', source),
      path.join(fontDirectory, filename)
    )
  )
);

console.log('Bloom Manrope and Newsreader font assets synchronized.');
