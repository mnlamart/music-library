/**
 * Selection state for bulk operations.
 *
 * This module is intentionally not `*.client.ts`. Route components call these
 * hooks during SSR, and React Router replaces `.client` exports with
 * `undefined` in the server bundle.
 *
 * State is read from localStorage after mount so the server render and the
 * first client render stay in sync.
 */

import { useEffect, useState, useCallback } from "react";
import {
  broadcastCuratorMessage,
  subscribeToCuratorSync,
  type CuratorSyncMessage,
} from "./sync.client";

const SELECTION_MODE_KEY = "curator:selection-mode";
const SELECTED_TRACKS_KEY = "curator:selected-tracks";

function readStorageItem(key: string): string | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Read whether selection mode is enabled from localStorage. */
export function getSelectionMode(): boolean {
  return readStorageItem(SELECTION_MODE_KEY) === "true";
}

/**
 * Set selection mode in localStorage
 */
export function setSelectionMode(enabled: boolean): void {
  if (typeof globalThis.localStorage === "undefined") return;
  try {
    globalThis.localStorage.setItem(SELECTION_MODE_KEY, String(enabled));
    // Broadcast to other tabs
    broadcastCuratorMessage({
      type: "SELECTION_MODE_CHANGED",
      enabled,
    });
  } catch (error) {
    console.error("Failed to save selection mode:", error);
  }
}

/**
 * Get selected track IDs from localStorage
 */
export function getSelectedTrackIds(): Set<string> {
  try {
    const stored = readStorageItem(SELECTED_TRACKS_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

/**
 * Save selected track IDs to localStorage
 */
export function saveSelectedTrackIds(trackIds: Set<string>): void {
  if (typeof globalThis.localStorage === "undefined") return;
  try {
    const array = Array.from(trackIds);
    globalThis.localStorage.setItem(SELECTED_TRACKS_KEY, JSON.stringify(array));
    // Broadcast to other tabs
    broadcastCuratorMessage({
      type: "SELECTION_UPDATED",
      trackIds: array,
    });
  } catch (error) {
    console.error("Failed to save selected tracks:", error);
  }
}

/**
 * Clear selected track IDs from localStorage
 */
export function clearSelectedTrackIds(): void {
  if (typeof globalThis.localStorage === "undefined") return;
  try {
    globalThis.localStorage.removeItem(SELECTED_TRACKS_KEY);
    // Broadcast to other tabs
    broadcastCuratorMessage({
      type: "SELECTION_UPDATED",
      trackIds: [],
    });
  } catch (error) {
    console.error("Failed to clear selected tracks:", error);
  }
}

/**
 * React hook for selection mode
 */
export function useSelectionMode() {
  const [selectionMode, setSelectionModeState] = useState(false);

  useEffect(() => {
    setSelectionModeState(getSelectionMode());

    // Subscribe to selection mode changes from other tabs
    const unsubscribe = subscribeToCuratorSync((message: CuratorSyncMessage) => {
      if (message.type === "SELECTION_MODE_CHANGED") {
        setSelectionModeState(message.enabled);
      }
    });

    return unsubscribe;
  }, []);

  const toggleSelectionMode = useCallback(() => {
    const newMode = !selectionMode;
    setSelectionMode(newMode);
    setSelectionModeState(newMode);

    // Clear selection when disabling selection mode
    if (!newMode) {
      clearSelectedTrackIds();
    }
  }, [selectionMode]);

  return {
    selectionMode,
    toggleSelectionMode,
  };
}

/**
 * React hook for track selection state
 */
export function useSelection() {
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedTrackIds(getSelectedTrackIds());

    // Subscribe to selection changes from other tabs
    const unsubscribe = subscribeToCuratorSync((message: CuratorSyncMessage) => {
      if (message.type === "SELECTION_UPDATED") {
        setSelectedTrackIds(new Set(message.trackIds));
      }
    });

    return unsubscribe;
  }, []);

  const selectAll = useCallback((trackIds: string[]) => {
    const newSelection = new Set(trackIds);
    setSelectedTrackIds(newSelection);
    saveSelectedTrackIds(newSelection);
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedTrackIds(new Set());
    clearSelectedTrackIds();
  }, []);

  const toggleSelection = useCallback((trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      saveSelectedTrackIds(next);
      return next;
    });
  }, []);

  const selectRange = useCallback((startIndex: number, endIndex: number, allTrackIds: string[]) => {
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    const rangeIds = allTrackIds.slice(min, max + 1);

    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      rangeIds.forEach((id) => next.add(id));
      saveSelectedTrackIds(next);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (trackId: string) => selectedTrackIds.has(trackId),
    [selectedTrackIds],
  );

  return {
    selectedTrackIds,
    selectAll,
    deselectAll,
    toggleSelection,
    selectRange,
    isSelected,
    selectedCount: selectedTrackIds.size,
  };
}
