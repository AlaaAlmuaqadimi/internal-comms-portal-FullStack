import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { typography } from '../constants/typography';
import { borderRadius } from '../constants/spacing';

const UserAvatar = ({
  person,
  size = 'medium', // small, medium, large, xlarge
  style,
}) => {
  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return { width: 32, height: 32, borderRadius: borderRadius.sm };
      case 'large':
        return { width: 64, height: 64, borderRadius: borderRadius.lg };
      case 'xlarge':
        return { width: 96, height: 96, borderRadius: borderRadius.xl };
      default:
        return { width: 48, height: 48, borderRadius: borderRadius.md };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small':
        return 14;
      case 'large':
        return 24;
      case 'xlarge':
        return 32;
      default:
        return 18;
    }
  };

  const sizeStyle = getSizeStyle();

  // إذا كان المطبخ
  if (person.isKitchen) {
    return (
      <View style={[styles.container, sizeStyle, styles.kitchen, style]}>
        <Ionicons name="restaurant" size={getFontSize()} color={colors.warning} />
      </View>
    );
  }

  // إذا كان لديه صورة
  if (person.avatar) {
    return (
      <Image
        source={{ uri: person.avatar }}
        style={[styles.image, sizeStyle, style]}
        accessibilityLabel={person.avatarAlt || person.name}
      />
    );
  }

  // إذا لم يكن لديه صورة - عرض الحرف الأول
  const initial = person.name ? person.name.charAt(0) : '؟';

  return (
    <View style={[styles.container, sizeStyle, styles.default, style]}>
      <Text style={[styles.initial, { fontSize: getFontSize() }]}>{initial}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  default: {
    backgroundColor: '#eaf1f7',
  },
  kitchen: {
    backgroundColor: '#f4ede0',
  },
  image: {
    backgroundColor: '#e5ecf1',
  },
  initial: {
    ...typography.h3,
    color: colors.primaryLight,
    fontWeight: '700',
  },
});

export default UserAvatar;
