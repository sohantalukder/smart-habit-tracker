import { type PropsWithChildren, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@sohantalukder/rn-kit';
import { useApp } from '@/app/AppProvider';
import { SyncBanner } from './SyncBanner';
import { BloomLogo } from './BloomLogo';
import { BloomText } from './BloomText';
import { bloomColors } from '@/theme/bloomTheme';

export function Screen({
  title,
  subtitle,
  children,
  action,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
}>) {
  const { colors } = useTheme();
  const { syncState, syncNow } = useApp();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.topbar}>
        <BloomLogo compact />
        <SyncBanner />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={syncState === 'syncing'}
            onRefresh={() => void syncNow()}
          />
        }
      >
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <BloomText
              family="display"
              variant="heading1"
              style={styles.title}
            >
              {title}
            </BloomText>
            {subtitle && (
              <BloomText style={styles.subtitle}>{subtitle}</BloomText>
            )}
          </View>
          {action}
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 18, paddingBottom: 42 },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headingCopy: { flex: 1, gap: 4 },
  root: { flex: 1 },
  subtitle: { color: bloomColors.muted, lineHeight: 21 },
  title: {
    color: bloomColors.ink,
    fontSize: 36,
    letterSpacing: -1.3,
    lineHeight: 40,
  },
  topbar: {
    alignItems: 'center',
    backgroundColor: bloomColors.paper,
    borderBottomColor: bloomColors.rule,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 18,
  },
});
