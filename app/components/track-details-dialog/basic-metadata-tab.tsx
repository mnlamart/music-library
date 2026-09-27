import { useState } from "react";
import { ArtistAutocomplete } from "#app/components/artist-autocomplete";
import { Button } from "#app/components/ui/button";
import { Input } from "#app/components/ui/input";
import { Label } from "#app/components/ui/label";
import { type TrackDetails } from "../track-details-dialog";

interface BasicMetadataTabProps {
  track: TrackDetails;
  onSave: (changes: any) => void;
}

export function BasicMetadataTab({ track, onSave }: BasicMetadataTabProps) {
  const [title, setTitle] = useState(track.title);
  const [artistId, setArtistId] = useState(track.artist.id);
  const [albumName, setAlbumName] = useState(track.albumRecord?.name ?? "");
  const [genre, setGenre] = useState(track.genre ?? "");
  const [year, setYear] = useState(track.year?.toString() ?? "");

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleArtistChange = (id: string | null, name: string) => {
    setArtistId(id ?? "");
    if (errors.artist) {
      setErrors((prev) => ({ ...prev, artist: "" }));
    }
  };

  const handleCreateArtist = async (name: string) => {
    try {
      const response = await fetch("/api/artists/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        throw new Error(errorData.error || "Failed to create artist");
      }

      const data = (await response.json()) as { artist: { id: string; name: string } };
      handleArtistChange(data.artist.id, data.artist.name);
    } catch (error) {
      console.error("Error creating artist:", error);
      throw error;
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = "Title is required";
    }

    if (!artistId) {
      newErrors.artist = "Artist is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const changes = {
      title: title.trim(),
      artistId,
      albumId: track.albumRecord?.id ?? null,
      genre: genre.trim() || null,
      year: year ? parseInt(year, 10) : null,
    };

    onSave(changes);
  };

  const hasChanges =
    title !== track.title ||
    artistId !== track.artist.id ||
    genre !== (track.genre ?? "") ||
    year !== (track.year?.toString() ?? "");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) {
              setErrors((prev) => ({ ...prev, title: "" }));
            }
          }}
          placeholder="Track title"
          aria-invalid={errors.title ? true : undefined}
          className={errors.title ? "border-input-invalid" : ""}
        />
        {errors.title && (
          <div className="px-4 pt-1 pb-3">
            <div className="text-[10px] text-destructive">{errors.title}</div>
          </div>
        )}
      </div>

      <ArtistAutocomplete
        value={artistId}
        onChange={handleArtistChange}
        onCreateNew={handleCreateArtist}
        error={errors.artist}
        required
      />

      <div>
        <Label htmlFor="album">Album</Label>
        <Input
          id="album"
          value={albumName}
          onChange={(e) => setAlbumName(e.target.value)}
          placeholder="Album name"
          disabled
        />
        <p className="px-4 pt-1 text-[10px] text-muted-foreground">Album editing coming soon</p>
      </div>

      <div>
        <Label htmlFor="genre">Genre</Label>
        <Input
          id="genre"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          placeholder="Genre"
        />
      </div>

      <div>
        <Label htmlFor="year">Year</Label>
        <Input
          id="year"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Release year"
          min="1900"
          max={new Date().getFullYear() + 1}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={!hasChanges}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}
