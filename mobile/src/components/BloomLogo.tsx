/* eslint-disable react-native/no-raw-text */
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { BloomText } from './BloomText';
import { bloomColors } from '@/theme/bloomTheme';

export function BloomLogo({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Svg
        accessibilityLabel="Bloom"
        height={compact ? 40 : 52}
        role="img"
        viewBox="0 0 64 64"
        width={compact ? 40 : 52}
      >
        <Rect
          width="64"
          height="64"
          rx="18"
          fill={inverse ? '#F1C875' : '#15382F'}
        />
        <Path
          d="M32 48C22 43 17 35 19 24c8 1 13 5 15 12 1-11 7-17 16-19 2 14-5 25-18 31Z"
          fill={inverse ? '#15382F' : '#F5C972'}
        />
      </Svg>
      <BloomText
        family="display"
        style={[
          styles.wordmark,
          compact && styles.compactWordmark,
          inverse && styles.inverseWordmark,
        ]}
      >
        Bloom
      </BloomText>
    </View>
  );
}

const styles = StyleSheet.create({
  compactWordmark: { fontSize: 25, lineHeight: 29 },
  inverseWordmark: { color: bloomColors.white },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  wordmark: {
    color: bloomColors.ink,
    fontSize: 30,
    letterSpacing: -1.2,
    lineHeight: 34,
  },
});
