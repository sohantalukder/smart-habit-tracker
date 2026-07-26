import type { ComponentProps } from 'react';
import { Text as KitText } from '@sohantalukder/rn-kit';
import { bloomFonts } from '@/theme/bloomTheme';

type BloomTextProps = ComponentProps<typeof KitText> & {
  family?: 'body' | 'display' | 'displayItalic';
};

const bodyFonts = {
  bold: bloomFonts.bodyBold,
  medium: bloomFonts.bodyMedium,
  regular: bloomFonts.body,
  semibold: bloomFonts.bodySemibold,
} as const;

export function BloomText({
  family,
  style,
  variant = 'body1',
  weight = 'regular',
  ...props
}: BloomTextProps) {
  const isHeading = String(variant).startsWith('heading');
  const fontFamily =
    family === 'displayItalic'
      ? bloomFonts.displayItalic
      : family === 'display' || (family === undefined && isHeading)
        ? bloomFonts.display
        : bodyFonts[weight];

  return (
    <KitText
      {...props}
      variant={variant}
      weight={weight}
      style={[{ fontFamily }, style]}
    />
  );
}
