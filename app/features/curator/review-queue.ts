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
