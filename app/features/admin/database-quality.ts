/**
 * Shared constants and utilities for Admin Database Quality & Health Monitoring
 * Can be used by both server and client code.
 */

export const METRIC_WEIGHTS = {
  audio: 0.30,
  covers: 0.25,
  duration: 0.15,
  album: 0.10,
  year: 0.10,
  genre: 0.05,
  lyrics: 0.05,
} as const;

export interface MetricTarget {
  audio: number;
  covers: number;
  duration: number;
  album: number;
  year: number;
  genre: number;
  lyrics: number;
}

export const METRIC_TARGETS: MetricTarget = {
  audio: 100,
  covers: 95,
  duration: 99,
  album: 80,
  year: 85,
  genre: 60,
  lyrics: 10,
} as const;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
