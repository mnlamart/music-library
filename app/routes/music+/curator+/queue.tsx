import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { useState, useEffect } from "react";
import { data } from "react-router";
import { Button } from "#app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#app/components/ui/select";
import { Label } from "#app/components/ui/label";
import { Textarea } from "#app/components/ui/textarea";
import { Icon } from "#app/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#app/components/ui/dialog";
import { Badge } from "#app/components/ui/badge";
import { requireCuratorRole } from "#app/utils/permissions.server.ts";
import { type Route } from "./+types/queue";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireCuratorRole(request);

  // The actual data loading is done by the API endpoint
  // This just ensures the user is authorized
  return data({ userId });
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  wrong_metadata: "Wrong metadata",
  missing_info: "Missing info",
  low_quality: "Low quality",
  duplicate: "Duplicate",
  other: "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  user_report: "User Report",
  system: "System Detection",
  curator: "Curator Flag",
};

const RESOLUTION_OPTIONS = [
  { value: "fixed", label: "Fixed" },
  { value: "not_an_issue", label: "Not an issue" },
  { value: "duplicate", label: "Duplicate" },
  { value: "cannot_fix", label: "Cannot fix" },
];

export default function QueuePage() {
  const { userId } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<any>();

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [resolution, setResolution] = useState<string>("");
  const [resolutionComment, setResolutionComment] = useState("");

  // Get filter params
  const status = searchParams.get("status") || "open";
  const entityType = searchParams.get("entityType") || "";
  const source = searchParams.get("source") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);

  // Load queue data
  const queueFetcher = useFetcher<any>();
  const isLoading = queueFetcher.state !== "idle";

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (entityType) params.set("entityType", entityType);
    if (source) params.set("source", source);
    params.set("page", page.toString());

    queueFetcher.load(`/api/curator/queue?${params.toString()}`);
  }, [status, entityType, source, page]);

  const queueData = queueFetcher.data;
  const items = queueData?.items || [];
  const totalPages = queueData?.totalPages || 1;

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1"); // Reset to first page
    setSearchParams(params);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    setSearchParams(params);
  };

  const handleClaim = async (itemId: string) => {
    const formData = new FormData();
    await fetcher.submit(formData, {
      method: "POST",
      action: `/api/curator/queue/${itemId}/claim`,
    });

    // Reload queue data
    setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      queueFetcher.load(`/api/curator/queue?${params.toString()}`);
    }, 100);
  };

  const handleUnclaim = async (itemId: string) => {
    const formData = new FormData();
    await fetcher.submit(formData, {
      method: "POST",
      action: `/api/curator/queue/${itemId}/unclaim`,
    });

    // Reload queue data
    setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      queueFetcher.load(`/api/curator/queue?${params.toString()}`);
    }, 100);
  };

  const handleResolve = (item: any) => {
    setSelectedItem(item);
    setResolution("");
    setResolutionComment("");
    setResolveDialogOpen(true);
  };

  const handleSubmitResolution = async () => {
    if (!selectedItem || !resolution || !resolutionComment.trim()) return;

    const formData = new FormData();
    formData.append("resolution", resolution);
    formData.append("resolutionComment", resolutionComment);

    await fetcher.submit(formData, {
      method: "POST",
      action: `/api/curator/queue/${selectedItem.id}/resolve`,
    });

    setResolveDialogOpen(false);
    setSelectedItem(null);

    // Reload queue data
    setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      queueFetcher.load(`/api/curator/queue?${params.toString()}`);
    }, 100);
  };

  const getPriorityBadge = (priority: number) => {
    switch (priority) {
      case 3:
        return <Badge variant="destructive">High</Badge>;
      case 2:
        return <Badge variant="default">Medium</Badge>;
      case 1:
      default:
        return <Badge variant="secondary">Low</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="outline">Open</Badge>;
      case "claimed":
        return <Badge variant="default">Claimed</Badge>;
      case "resolved":
        return <Badge variant="secondary">Resolved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Review Queue</h1>
        <p className="text-muted-foreground">
          Manage and resolve reported issues and quality problems
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => updateFilter("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="claimed">Claimed</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={entityType} onValueChange={(v) => updateFilter("entityType", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  <SelectItem value="track">Track</SelectItem>
                  <SelectItem value="artist">Artist</SelectItem>
                  <SelectItem value="album">Album</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => updateFilter("source", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All sources</SelectItem>
                  <SelectItem value="user_report">User Report</SelectItem>
                  <SelectItem value="system">System Detection</SelectItem>
                  <SelectItem value="curator">Curator Flag</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Items */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Icon name="update" className="animate-spin h-8 w-8" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No items found matching the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item: any) => (
            <Card key={item.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getPriorityBadge(item.priority)}
                      {getStatusBadge(item.status)}
                      <Badge variant="outline">{SOURCE_LABELS[item.source] || item.source}</Badge>
                      <Badge variant="outline">
                        {ISSUE_TYPE_LABELS[item.issueType] || item.issueType}
                      </Badge>
                    </div>

                    <h3 className="font-semibold text-lg mb-1">
                      {item.entityDetails?.name || "Unknown Entity"}
                    </h3>

                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {item.reporter && (
                        <span>Reported by: {item.reporter.name || item.reporter.username}</span>
                      )}
                      {item.claimedByUser && (
                        <span>
                          Claimed by: {item.claimedByUser.name || item.claimedByUser.username}
                        </span>
                      )}
                      {item.resolvedByUser && (
                        <span>
                          Resolved by: {item.resolvedByUser.name || item.resolvedByUser.username}
                        </span>
                      )}
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>

                    {item.resolution && (
                      <div className="mt-2 p-2 bg-muted rounded text-sm">
                        <strong>Resolution:</strong> {item.resolution}
                        {item.resolutionComment && <p className="mt-1">{item.resolutionComment}</p>}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {item.status === "open" && (
                      <Button size="sm" onClick={() => handleClaim(item.id)}>
                        Claim
                      </Button>
                    )}
                    {item.status === "claimed" && item.claimedBy === userId && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleUnclaim(item.id)}>
                          Unclaim
                        </Button>
                        <Button size="sm" onClick={() => handleResolve(item)}>
                          Resolve
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1}
          >
            <Icon name="arrow-left" />
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
            <Icon name="arrow-right" />
          </Button>
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Resolve Queue Item</DialogTitle>
            <DialogDescription>
              Choose a resolution and provide a comment explaining your decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution *</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger id="resolution">
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolution-comment">Comment *</Label>
              <Textarea
                id="resolution-comment"
                value={resolutionComment}
                onChange={(e) => setResolutionComment(e.target.value)}
                placeholder="Explain your resolution..."
                rows={4}
                maxLength={1000}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {resolutionComment.length}/1000 characters
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitResolution}
              disabled={!resolution || !resolutionComment.trim()}
            >
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
