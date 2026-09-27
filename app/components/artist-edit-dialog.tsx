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

export interface Artist {
  id: string;
  name: string;
  bio: string | null;
  genre: string | null;
  country: string | null;
  imageUrl: string | null;
  website: string | null;
}

interface ArtistEditDialogProps {
  artist: Artist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function ArtistEditDialog({ artist, open, onOpenChange, onSaved }: ArtistEditDialogProps) {
  const editFetcher = useFetcher();

  const [formData, setFormData] = useState({
    name: artist.name,
    bio: artist.bio || "",
    genre: artist.genre || "",
    country: artist.country || "",
    imageUrl: artist.imageUrl || "",
    website: artist.website || "",
    comment: "",
  });

  const isSubmitting = editFetcher.state !== "idle";
  const hasChanges =
    formData.name !== artist.name ||
    formData.bio !== (artist.bio || "") ||
    formData.genre !== (artist.genre || "") ||
    formData.country !== (artist.country || "") ||
    formData.imageUrl !== (artist.imageUrl || "") ||
    formData.website !== (artist.website || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges) return;

    editFetcher.submit(
      {
        name: formData.name,
        bio: formData.bio || null,
        genre: formData.genre || null,
        country: formData.country || null,
        imageUrl: formData.imageUrl || null,
        website: formData.website || null,
        comment: formData.comment,
      },
      {
        method: "POST",
        action: `/api/metadata/artists/${artist.id}/edit`,
        encType: "application/json",
      },
    );
  };

  // Close dialog and notify parent on successful save
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
          <DialogTitle>Edit Artist</DialogTitle>
          <DialogDescription>
            Update artist details. All changes are logged for curator review.
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
            <Label htmlFor="bio">Biography</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={4}
              placeholder="Add artist biography..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="genre">Genre</Label>
              <Input
                id="genre"
                value={formData.genre}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                placeholder="e.g., Rock, Pop, Jazz"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="e.g., United States, UK"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input
              id="imageUrl"
              type="url"
              value={formData.imageUrl}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
              placeholder="https://example.com/artist-image.jpg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://artist-website.com"
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
