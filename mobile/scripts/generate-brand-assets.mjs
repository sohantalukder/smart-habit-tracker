import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const webLogoPath = path.resolve(mobileRoot, '../client/public/icon.svg');
const webLogo = await readFile(webLogoPath);

async function render(source, output, size) {
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(source)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toFile(output);
}

await render(webLogo, path.join(mobileRoot, 'src/assets/images/logo.png'), 512);

const iosIcons = new Map([
  ['Icon-App-20x20@1x.png', 20],
  ['Icon-App-20x20@2x.png', 40],
  ['Icon-App-20x20@3x.png', 60],
  ['Icon-App-29x29@1x.png', 29],
  ['Icon-App-29x29@2x.png', 58],
  ['Icon-App-29x29@3x.png', 87],
  ['Icon-App-40x40@1x.png', 40],
  ['Icon-App-40x40@2x.png', 80],
  ['Icon-App-40x40@3x.png', 120],
  ['Icon-App-60x60@2x.png', 120],
  ['Icon-App-60x60@3x.png', 180],
  ['Icon-App-76x76@1x.png', 76],
  ['Icon-App-76x76@2x.png', 152],
  ['Icon-App-83.5x83.5@2x.png', 167],
  ['ItunesArtwork@2x.png', 1024],
]);
const iosIconDirectory = path.join(
  mobileRoot,
  'ios/Bloom/Images.xcassets/AppIcon.appiconset'
);
await Promise.all(
  [...iosIcons].map(([filename, size]) =>
    render(webLogo, path.join(iosIconDirectory, filename), size)
  )
);

const splashDirectory = path.join(
  mobileRoot,
  'ios/Bloom/Images.xcassets/SplashIcon.imageset'
);
await Promise.all(
  [1, 2, 3].map((scale) =>
    render(
      webLogo,
      path.join(splashDirectory, `Logo@${scale}x.png`),
      72 * scale
    )
  )
);

const androidDensities = {
  ldpi: 36,
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};
await Promise.all(
  Object.entries(androidDensities).flatMap(([density, size]) => {
    const directory = path.join(
      mobileRoot,
      `android/app/src/main/res/mipmap-${density}`
    );
    return ['ic_launcher.png', 'ic_launcher_round.png'].map((filename) =>
      render(webLogo, path.join(directory, filename), size)
    );
  })
);

const leafSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
    <path d="M54 84C37.1 75.5 28.7 62 32 43.4c13.5 1.7 22 8.4 25.4 20.3C59 45.1 69.1 35 84.3 31.6 87.7 55.3 75.9 73.9 54 84Z" fill="#F5C972"/>
  </svg>
`);
await Promise.all(
  Object.entries(androidDensities)
    .filter(([density]) => density !== 'ldpi')
    .map(([density, size]) =>
      render(
        leafSvg,
        path.join(
          mobileRoot,
          `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`
        ),
        Math.round(size * 2.25)
      )
    )
);
await render(
  webLogo,
  path.join(mobileRoot, 'android/app/src/main/res/drawable/splash_icon.png'),
  192
);

console.log('Bloom brand assets generated from client/public/icon.svg.');
