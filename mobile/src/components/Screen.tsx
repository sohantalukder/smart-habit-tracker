import { type PropsWithChildren, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@sohantalukder/rn-kit';
import { useApp } from '@/app/AppProvider';
import { SyncBanner } from './SyncBanner';

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
      <SyncBanner />
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
            <Text
              variant="heading1"
              weight="bold"
            >
              {title}
            </Text>
            {subtitle && <Text color="secondary">{subtitle}</Text>}
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
});
