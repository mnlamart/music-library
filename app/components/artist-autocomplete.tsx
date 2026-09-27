import { useState, useEffect, useCallback, useRef } from "react";
import { useFetcher } from "react-router";
import { Input } from "#app/components/ui/input";
import { Label } from "#app/components/ui/label";
import { Icon } from "#app/components/ui/icon";
import { cn } from "#app/utils/misc";

interface Artist {
  id: string;
  name: string;
  trackCount: number;
}

interface ArtistAutocompleteProps {
  value: string | null;
  onChange: (artistId: string | null, artistName: string) => void;
  onCreateNew?: (name: string) => Promise<void>;
  error?: string;
  className?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export function ArtistAutocomplete({
  onChange,
  onCreateNew,
  error,
  className,
  label = "Artist",
  required = false,
  disabled = false,
}: ArtistAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const searchFetcher = useFetcher<{ artists: Artist[] }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const artists = searchFetcher.data?.artists ?? [];
  const isSearching = searchFetcher.state !== "idle";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim().length >= 1) {
        searchFetcher.load(`/api/artists/search?q=${encodeURIComponent(query.trim())}`);
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    },
    [searchFetcher],
  );

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (inputValue) {
        handleSearch(inputValue);
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [inputValue, handleSearch]);

  const handleSelect = (artist: Artist) => {
    setInputValue(artist.name);
    onChange(artist.id, artist.name);
    setIsOpen(false);
  };

  const handleCreateNew = async () => {
    if (!inputValue.trim() || !onCreateNew) return;

    setIsCreating(true);
    try {
      await onCreateNew(inputValue.trim());
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to create artist:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const showCreateOption =
    inputValue.trim().length > 0 && artists.length === 0 && !isSearching && onCreateNew;

  return (
    <div className={cn("relative", className)}>
      <Label htmlFor="artist-input">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id="artist-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => {
            if (inputValue.trim()) {
              handleSearch(inputValue);
            }
          }}
          placeholder="Search or create artist..."
          disabled={disabled || isCreating}
          aria-invalid={error ? true : undefined}
          className={cn(error && "border-input-invalid")}
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Icon name="update" className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {isOpen && (artists.length > 0 || showCreateOption) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {artists.map((artist) => (
            <button
              key={artist.id}
              type="button"
              onClick={() => handleSelect(artist)}
              className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-hidden"
            >
              <span className="font-medium">{artist.name}</span>
              <span className="text-xs text-muted-foreground">
                {artist.trackCount} {artist.trackCount === 1 ? "track" : "tracks"}
              </span>
            </button>
          ))}

          {showCreateOption && (
            <>
              {artists.length > 0 && <div className="my-1 h-px bg-border" />}
              <button
                type="button"
                onClick={handleCreateNew}
                disabled={isCreating}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-hidden disabled:opacity-50"
              >
                <Icon name="plus" className="h-4 w-4" />
                <span>Create new artist &quot;{inputValue.trim()}&quot;</span>
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="min-h-[32px] px-4 pt-1 pb-3">
          <div className="text-[10px] text-destructive">{error}</div>
        </div>
      )}
    </div>
  );
}
