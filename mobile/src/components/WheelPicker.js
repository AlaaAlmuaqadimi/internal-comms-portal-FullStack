import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius, shadows } from '../constants/spacing';
import { flipStyles } from '../i18n/rtlStyles';
import { useLanguage } from '../context/LanguageContext';
import { playTick } from '../services/sound';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;

/**
 * Vertical "ball roller" selector.
 *
 * The list snaps to whole rows, the centred row is highlighted and scaled up,
 * and every time the selected row changes a short spinning tick is played.
 */
const WheelPicker = ({
  options = [],
  value,
  onChange,
  itemHeight = ITEM_HEIGHT,
  visibleItems = VISIBLE_ITEMS,
  enabled = true,
}) => {
  const { colors } = useTheme();
  const { isRTL } = useLanguage();
  const styles = useMemo(
    () => flipStyles(createStyles(colors), isRTL),
    [colors, isRTL]
  );

  const listRef = useRef(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);

  const selectedIndex = useMemo(() => {
    const found = options.findIndex((option) => option.key === value);
    return found >= 0 ? found : 0;
  }, [options, value]);

  // Keep the wheel in sync when the value is changed programmatically (for
  // example when the create form is reset after publishing).
  useEffect(() => {
    if (selectedIndex === indexRef.current) return;
    indexRef.current = selectedIndex;
    setIndex(selectedIndex);
    try {
      listRef.current?.scrollToOffset({
        offset: selectedIndex * itemHeight,
        animated: false,
      });
    } catch {
      // The list may not be laid out yet; the initial offset handles it.
    }
  }, [selectedIndex, itemHeight]);

  const commitIndex = useCallback(
    (next) => {
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
      if (enabled) {
        playTick();
        if (Platform.OS === 'android') {
          Vibration.vibrate(8);
        }
      }
      const option = options[next];
      if (option) onChange?.(option.key);
    },
    [enabled, onChange, options]
  );

  const handleScroll = useCallback(
    (event) => {
      const offset = event.nativeEvent.contentOffset?.y || 0;
      const raw = Math.round(offset / itemHeight);
      const next = Math.max(0, Math.min(options.length - 1, raw));
      commitIndex(next);
    },
    [commitIndex, itemHeight, options.length]
  );

  const handleMomentumEnd = useCallback(
    (event) => {
      const offset = event.nativeEvent.contentOffset?.y || 0;
      const raw = Math.round(offset / itemHeight);
      const next = Math.max(0, Math.min(options.length - 1, raw));
      commitIndex(next);
      try {
        listRef.current?.scrollToOffset({
          offset: next * itemHeight,
          animated: true,
        });
      } catch {
        // ignore
      }
    },
    [commitIndex, itemHeight, options.length]
  );

  const verticalPadding = Math.floor(visibleItems / 2) * itemHeight;
  const height = itemHeight * visibleItems;

  const renderItem = ({ item, index: itemIndex }) => {
    const distance = Math.abs(itemIndex - index);
    const opacity = distance === 0 ? 1 : distance === 1 ? 0.42 : 0.18;
    const isActive = distance === 0;

    return (
      <View style={[styles.item, { height: itemHeight }]}>
        <Text
          numberOfLines={1}
          style={[
            styles.itemText,
            isActive && styles.itemTextActive,
            { opacity },
          ]}
        >
          {item.label}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.wrapper, { height }]}>
      <View
        style={[styles.highlight, { height: itemHeight, marginTop: -itemHeight / 2 }]}
        pointerEvents="none"
      />

      <FlatList
        ref={listRef}
        data={options}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        bounces={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={{ paddingVertical: verticalPadding }}
        style={{ height }}
        initialScrollIndex={selectedIndex}
        getItemLayout={(_, itemIndex) => ({
          length: itemHeight,
          offset: itemHeight * itemIndex,
          index: itemIndex,
        })}
        onScrollToIndexFailed={() => {
          try {
            listRef.current?.scrollToOffset({
              offset: selectedIndex * itemHeight,
              animated: false,
            });
          } catch {
            // ignore
          }
        }}
      />
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  wrapper: {
    width: '100%',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  highlight: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: '50%',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.infoLight,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  itemText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  itemTextActive: {
    ...typography.h4,
    color: colors.primaryLight,
    fontFamily: 'Cairo_700Bold',
  },
});

export default WheelPicker;
