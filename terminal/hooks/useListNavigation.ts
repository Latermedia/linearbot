import { useState, useEffect } from "react";

/**
 * Hook for managing list navigation with keyboard controls and scrolling
 * Handles up/down arrow keys (or j/k vim-style) and maintains scroll position
 */
export function useListNavigation(itemCount: number, visibleLines: number) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reset when item count changes
  useEffect(() => {
    if (selectedIndex >= itemCount && itemCount > 0) {
      setSelectedIndex(itemCount - 1);
    }
  }, [itemCount, selectedIndex]);

  // Auto-scroll to keep selected item visible
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + visibleLines) {
      setScrollOffset(selectedIndex - visibleLines + 1);
    }
  }, [selectedIndex, scrollOffset, visibleLines]);

  const handleUp = () => {
    if (selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleDown = () => {
    if (selectedIndex < itemCount - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const reset = () => {
    setSelectedIndex(0);
    setScrollOffset(0);
  };

  return {
    selectedIndex,
    scrollOffset,
    handleUp,
    handleDown,
    reset,
    setSelectedIndex,
    setScrollOffset,
  };
}

