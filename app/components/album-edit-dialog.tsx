import { useFetcher } from "react-router";
import { useState } from "react";
import { Button } from "#app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#app/components/ui/dialog";
import { Input } from "#app/components/ui/input";
import { Label } from "#app/components/ui/label";
import { Textarea } from "#app/components/ui/textarea";
import { Icon } from "#app/components/ui/icon";

export interface Album {
  id: string;
  name: string;
  artistId: string;
  year: number | null;
  coverImageId: string | null;
  artist: {
    id: string;
    name: string;
  };
}

interface AlbumEditDialogProps {
  album: Album;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function AlbumEditDialog({ album, open, onOpenChange, onSaved }: AlbumEditDialogProps) {
  const editFetcher = useFetcher();

  const [formData, setFormData] = useState({
    name: album.name,
    artistId: album.artistId,
    year: album.year?.toString() || "",
    comment: "",
  });

  const isSubmitting = editFetcher.state !== "idle";
  const hasChanges =
    formData.name !== album.name ||
    formData.artistId !== album.artistId ||
    formData.year !== (album.year?.toString() || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;

    editFetcher.submit(
      {
        name: formData.name,
        artistId: formData.artistId,
        year: formData.year ? parseInt(formData.year) : null,
        coverImageId: album.coverImageId,
        comment: formData.comment,
      },
      {
        method: "POST",
        action: `/api/metadata/albums/${album.id}/edit`,
        encType: "application/json",
      },
    );
  };

  if (editFetcher.state === "idle" && editFetcher.data && open) {
    setTimeout(() => {
      onOpenChange(false);
      onSaved?.();
    }, 0);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Album</DialogTitle>
          <DialogDescription>
            Update album details. Cover images cannot be edited directly.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="artist">Artist</Label>
            <div className="text-sm text-muted-foreground">{album.artist.name}</div>
            <p className="text-xs text-muted-foreground">
              To change the artist, use the merge albums feature
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              type="number"
              min="1900"
              max="2100"
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: e.target.value })}
              placeholder="e.g., 1969"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Textarea
              id="comment"
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              placeholder="Explain why you made these changes..."
              rows={2}
            />
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
            <Button type="submit" disabled={!hasChanges || isSubmitting}>
              {isSubmitting && <Icon name="update" className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
