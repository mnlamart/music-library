import { useEffect, useState, useCallback } from "react";

export type EntityType = "track" | "artist" | "album";

export interface LockInfo {
  id: string;
  entityType: EntityType;
  entityId: string;
  lockedBy: string;
  lockedByName: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface UseLockResult {
  lock: LockInfo | null;
  isLocked: boolean;
  isLockedByOther: boolean;
  isLoading: boolean;
  error: string | null;
  acquire: () => void;
  release: () => void;
  refresh: () => void;
}

/**
 * Hook to manage entity locks
 * Automatically acquires lock on mount and releases on unmount
 */
export function useLock(
  entityType: EntityType,
  entityId: string,
  options: {
    autoAcquire?: boolean;
    autoRelease?: boolean;
  } = {},
): UseLockResult {
  const { autoAcquire = true, autoRelease = true } = options;

  const [lock, setLock] = useState<LockInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Acquire lock
  const acquire = useCallback(() => {
    setIsLoading(true);
    setError(null);

    fetch("/api/locks/acquire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json()) as { message?: string };
          throw new Error(data.message || "Failed to acquire lock");
        }
        return res.json() as Promise<{ lock: LockInfo }>;
      })
      .then((data) => {
        setLock(data.lock);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [entityType, entityId]);

  // Release lock
  const release = useCallback(() => {
    if (!lock) return;

    fetch("/api/locks/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId }),
    })
      .then(() => {
        setLock(null);
      })
      .catch((err) => {
        console.error("Failed to release lock:", err);
      });
  }, [entityType, entityId, lock]);

  // Refresh lock status
  const refresh = useCallback(() => {
    fetch(`/api/locks/status?entityType=${entityType}&entityId=${entityId}`)
      .then((res) => res.json() as Promise<{ lock: LockInfo | null }>)
      .then((data) => {
        setLock(data.lock);
      })
      .catch((err: unknown) => {
        console.error("Failed to fetch lock status:", err);
      });
  }, [entityType, entityId]);

  // Auto-acquire on mount
  useEffect(() => {
    if (autoAcquire) {
      acquire();
    }
  }, [autoAcquire, acquire]);

  // Auto-release on unmount
  useEffect(() => {
    return () => {
      if (autoRelease && lock) {
        release();
      }
    };
  }, [autoRelease, lock, release]);

  const isLocked = !!lock;
  const isLockedByOther = false; // Will be determined by comparing lock.lockedBy with current user

  return {
    lock,
    isLocked,
    isLockedByOther,
    isLoading,
    error,
    acquire,
    release,
    refresh,
  };
}
