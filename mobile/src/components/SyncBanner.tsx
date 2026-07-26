import { StyleSheet, View } from 'react-native';
import { Badge } from '@sohantalukder/rn-kit';
import { useApp } from '@/app/AppProvider';

const labels = {
  offline: 'Offline',
  pending: 'Pending',
  syncing: 'Syncing',
  synced: 'Synced',
  needs_attention: 'Needs attention',
} as const;

export function SyncBanner() {
  const { syncState, pendingCount } = useApp();
  return (
    <View
      style={styles.row}
      accessibilityLiveRegion="polite"
    >
      <Badge
        text={`${labels[syncState]}${pendingCount ? ` · ${pendingCount}` : ''}`}
        bgColor={
          syncState === 'needs_attention'
            ? '#FDE8E8'
            : syncState === 'synced'
              ? '#DCFCE7'
              : '#FEF3C7'
        }
        textColor={syncState === 'needs_attention' ? '#991B1B' : '#365314'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 28,
  },
});
