import { useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { Button } from "#app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#app/components/ui/dialog";
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

interface ReportIssueDialogProps {
  trackId: string;
  trackTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ISSUE_TYPES = [
  { value: "wrong_metadata", label: "Wrong metadata" },
  { value: "missing_info", label: "Missing info" },
  { value: "low_quality", label: "Low quality" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
] as const;

export function ReportIssueDialog({
  trackId,
  trackTitle,
  open,
  onOpenChange,
}: ReportIssueDialogProps) {
  const fetcher = useFetcher();
  const [issueType, setIssueType] = useState<string>("");
  const [description, setDescription] = useState("");

  const isSubmitting = fetcher.state !== "idle";
  const isValid = issueType && description.trim().length > 0;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      // Reset form and close dialog on success
      setIssueType("");
      setDescription("");
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const formData = new FormData();
    formData.append("trackId", trackId);
    formData.append("issueType", issueType);
    formData.append("description", description);

    fetcher.submit(formData, {
      method: "POST",
      action: "/api/curator/queue/report",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Report Issue</DialogTitle>
          <DialogDescription>
            Report a problem with "{trackTitle}". Our curators will review your report.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="issue-type">Issue Type *</Label>
              <Select value={issueType} onValueChange={setIssueType}>
                <SelectTrigger id="issue-type">
                  <SelectValue placeholder="Select an issue type" />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe the issue in detail..."
                rows={5}
                maxLength={1000}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">{description.length}/1000 characters</p>
            </div>

            {fetcher.data?.error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <Icon name="question-mark-circled" />
                <span>{fetcher.data.error}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting && <Icon name="update" className="mr-2 animate-spin" />}
              Submit Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
