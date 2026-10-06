export const QUEUE_STATUS_MINE = "mine";

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  wrong_metadata: "Wrong metadata",
  missing_info: "Missing info",
  low_quality: "Low quality",
  duplicate: "Duplicate",
  other: "Other",
};

export function queueMatter(item: { issueType: string; description: string | null }): string {
  const description = item.description?.trim();
  if (description) return description;
  const label = ISSUE_TYPE_LABELS[item.issueType] ?? item.issueType;
  return `No extra detail was given. The report is marked as ${label}.`;
}

export function entityPath(entityType: string, entityId: string): string | null {
  if (entityType === "track") return `/library/${entityId}`;
  if (entityType === "artist") return `/artists/${entityId}`;
  if (entityType === "album") return `/albums/${entityId}`;
  return null;
}

export function entityTypeLabel(entityType: string): string {
  if (entityType === "track") return "Track";
  if (entityType === "artist") return "Artist";
  if (entityType === "album") return "Album";
  return entityType;
}

export type ReviewQueueListItem = {
  id: string;
  entityType: string;
  entityId: string;
  source: string;
  issueType: string;
  description: string | null;
  status: string;
  priority: number;
  claimedBy: string | null;
  resolution: string | null;
  resolutionComment: string | null;
  createdAt: string;
  entityDetails: { name: string };
  reporter: { id: string; username: string; name: string | null } | null;
  claimedByUser: { id: string; username: string; name: string | null } | null;
  resolvedByUser: { id: string; username: string; name: string | null } | null;
};
