import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '@/lib/theme';

interface FABProps {
  onPress: () => void;
  icon?: string;
}

export function FAB({ onPress, icon = 'plus' }: FABProps) {
  return (
    <TouchableOpacity
      style={styles.fab}
      activeOpacity={0.9}
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon as any} size={30} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
