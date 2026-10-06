import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';

const StatusBadge = ({
  status, // online, offline, kitchen, success, warning, danger
  text,
  showDot = true,
  style,
}) => {
  const getStatusStyle = () => {
    switch (status) {
      case 'online':
      case 'success':
        return {
          backgroundColor: colors.successLight,
          color: colors.success,
          dotColor: colors.success,
        };
      case 'offline':
        return {
          backgroundColor: colors.background,
          color: colors.textSecondary,
          dotColor: colors.textLight,
        };
      case 'kitchen':
      case 'warning':
        return {
          backgroundColor: colors.warningLight,
          color: colors.warning,
          dotColor: colors.warning,
        };
      case 'danger':
        return {
          backgroundColor: colors.dangerLight,
          color: colors.danger,
          dotColor: colors.danger,
        };
      default:
        return {
          backgroundColor: colors.background,
          color: colors.textSecondary,
          dotColor: colors.textLight,
        };
    }
  };

  const statusStyle = getStatusStyle();

  return (
    <View style={[styles.container, { backgroundColor: statusStyle.backgroundColor }, style]}>
      {showDot && (
        <View style={[styles.dot, { backgroundColor: statusStyle.dotColor }]} />
      )}
      <Text style={[styles.text, { color: statusStyle.color }]}>
        {text || (status === 'online' ? 'متصل الآن' : status === 'offline' ? 'غير متصل' : status)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.xs,
  },
  text: {
    ...typography.captionBold,
  },
});

export default StatusBadge;
