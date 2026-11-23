import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Vibration,
  View,
} from 'react-native';
import { Text } from './AppText';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../constants/typography';
import { spacing, borderRadius } from '../constants/spacing';

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// The active row is the only thing that changes while the wheel moves. Keeping
// that in a memoised row means a flick repaints five labels, not the screen
// that owns the wheel.
const WheelRow = React.memo(({ label, active, height, styles }) => (
  <View style={[styles.row, { height }]}>
    <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
      {label}
    </Text>
  </View>
));

/**
 * Smooth, snapping vertical wheel.
 *
 * `onChange` fires only once, after the wheel settles. The parent is therefore
 * never asked to re-render on every row that passes under the centre band.
 * Programmatic `scrollToOffset` calls (presets, or a clamped value coming back
 * from the parent) never echo an `onChange` because they do not start a drag.
 */
const WheelPicker = ({
  value = 0,
  onChange,
  items = [],
  itemHeight = ROW_HEIGHT,
  visibleRows = VISIBLE_ROWS,
  style,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const listRef = useRef(null);
  const dragged = useRef(false);
  const latestOffset = useRef(0);
  const settleTimer = useRef(null);
  const snapTimer = useRef(null);

  const maxIndex = Math.max(0, items.length - 1);
  const selectedIndex = clamp(Math.round(value) || 0, 0, maxIndex);
  const valueIndexRef = useRef(selectedIndex);
  const highlightRef = useRef(selectedIndex);
  const [highlightIndex, setHighlightIndex] = useState(selectedIndex);

  const scrollToIndex = useCallback(
    (index, animated = true) => {
      const target = clamp(Math.round(index), 0, maxIndex);
      try {
        listRef.current?.scrollToOffset({
          offset: target * itemHeight,
          animated,
        });
      } catch {
        // The list may not be mounted yet.
      }
    },
    [itemHeight, maxIndex]
  );

  const indexFromOffset = useCallback(
    (offsetY) => clamp(Math.round(offsetY / itemHeight), 0, maxIndex),
    [itemHeight, maxIndex]
  );

  const applyHighlight = useCallback((index) => {
    if (index === highlightRef.current) return;
    highlightRef.current = index;
    setHighlightIndex(index);
  }, []);

  // Keep the wheel on the parent's value. This also corrects the wheel after
  // the parent clamps a value the user scrolled to (for example 0d 0h -> 1h).
  useEffect(() => {
    valueIndexRef.current = selectedIndex;
    if (dragged.current) return;
    applyHighlight(selectedIndex);
    scrollToIndex(selectedIndex, true);
  }, [applyHighlight, scrollToIndex, selectedIndex]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (snapTimer.current) clearTimeout(snapTimer.current);
    },
    []
  );

  // Called once, when the wheel has stopped. Vibration on Android only; on iOS
  // Vibration.vibrate does nothing useful.
  const commitSettled = useCallback(() => {
    if (!dragged.current) return;
    dragged.current = false;

    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }

    const index = indexFromOffset(latestOffset.current);
    applyHighlight(index);

    if (index !== valueIndexRef.current) {
      // One short tick per settled value change (Android only).
      if (Platform.OS === 'android') Vibration.vibrate(8);
      onChange?.(index);
    }

    // If the parent rejects the value (min/max), it does not change and the
    // effect above never runs; snap back to the value it actually holds.
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      if (dragged.current) return;
      scrollToIndex(valueIndexRef.current, true);
    }, 80);
  }, [applyHighlight, indexFromOffset, onChange, scrollToIndex]);

  const handleScrollBeginDrag = useCallback(() => {
    dragged.current = true;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const handleScroll = useCallback(
    (event) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      latestOffset.current = offsetY;
      applyHighlight(indexFromOffset(offsetY));
    },
    [applyHighlight, indexFromOffset]
  );

  const handleScrollEndDrag = useCallback(
    (event) => {
      latestOffset.current = event.nativeEvent.contentOffset.y;
      // Some platforms do not fire onMomentumScrollEnd when the drag ends
      // without momentum, so settle shortly after the finger lifts. A real
      // momentum start cancels this timer.
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(commitSettled, 120);
    },
    [commitSettled]
  );

  const handleMomentumScrollBegin = useCallback(() => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (event) => {
      latestOffset.current = event.nativeEvent.contentOffset.y;
      commitSettled();
    },
    [commitSettled]
  );

  const renderItem = useCallback(
    ({ item, index }) => (
      <WheelRow
        label={item}
        active={index === highlightIndex}
        height={itemHeight}
        styles={styles}
      />
    ),
    [highlightIndex, itemHeight, styles]
  );

  return (
    <View style={[styles.wrapper, { height: itemHeight * visibleRows }, style]}>
      {/* Highlighted centre band (2 rows of padding above it). */}
      <View
        pointerEvents="none"
        style={[styles.centerBand, { top: itemHeight * 2, height: itemHeight }]}
      />
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item, index) => `${index}:${item}`}
        renderItem={renderItem}
        extraData={highlightIndex}
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        initialScrollIndex={selectedIndex}
        onScrollToIndexFailed={({ index }) => scrollToIndex(index, false)}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        removeClippedSubviews={false}
        initialNumToRender={Math.max(items.length, 1)}
        maxToRenderPerBatch={Math.max(items.length, 1)}
        windowSize={Math.max(items.length, 1)}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{ paddingVertical: itemHeight * 2 }}
      />
    </View>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    wrapper: {
      minWidth: 64,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    centerBand: {
      position: 'absolute',
      left: spacing.xs,
      right: spacing.xs,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: colors.primaryLight,
      backgroundColor: colors.infoLight,
    },
    row: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    label: {
      ...typography.body,
      color: colors.textLight,
      textAlign: 'center',
      fontSize: 16,
    },
    labelActive: {
      ...typography.bodyBold,
      color: colors.primaryLight,
      fontSize: 18,
    },
  });

export default WheelPicker;
