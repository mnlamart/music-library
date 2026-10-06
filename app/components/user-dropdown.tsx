import { useRef } from "react";
import { Link, Form } from "react-router";
import { getUserImgSrc } from "#app/utils/misc.tsx";
import { useUser, userHasRole } from "#app/utils/user.ts";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { Icon } from "./ui/icon";
import { discardSession } from "#app/features/curator/session-recovery.client.ts";

export function UserDropdown() {
  const user = useUser();
  const formRef = useRef<HTMLFormElement>(null);
  const isAdmin = userHasRole(user, "admin");
  const isCurator = userHasRole(user, "curator") || isAdmin;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-8 w-8 rounded-full p-0"
          aria-label="User menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={getUserImgSrc(user.image?.objectKey)}
              alt={user.name ?? user.username}
            />
            <AvatarFallback>{user.name?.[0] ?? user.username[0]}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          sideOffset={8}
          align="end"
          className="max-h-[calc(100dvh-12.5rem)] overflow-y-auto"
        >
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to={`/users/${user.username}`}>
              <Icon className="text-body-md" name="avatar">
                Profile
              </Icon>
            </Link>
          </DropdownMenuItem>
          {/* Desktop-only: these routes are in the mobile bottom nav (md:hidden). */}
          <DropdownMenuItem asChild className="max-md:hidden">
            <Link prefetch="intent" to="/library">
              <Icon className="text-body-md" name="file-text">
                My Library
              </Icon>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to="/downloads">
              <Icon className="text-body-md" name="download">
                Downloads
              </Icon>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="max-md:hidden">
            <Link prefetch="intent" to="/playlists">
              <Icon className="text-body-md" name="file-text">
                My Playlists
              </Icon>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="max-md:hidden">
            <Link prefetch="intent" to="/history">
              <Icon className="text-body-md" name="clock">
                History
              </Icon>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to="/reports">
              <Icon className="text-body-md" name="file-text">
                My reports
              </Icon>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to="/rooms">
              <Icon className="text-body-md" name="speaker-wave">
                Party Room
              </Icon>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link prefetch="intent" to="/music/services">
              <Icon className="text-body-md" name="link-2">
                Connected Services
              </Icon>
            </Link>
          </DropdownMenuItem>
          {isCurator && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/music/curator/dashboard">
                <Icon className="text-body-md" name="pencil-2">
                  Curator Dashboard
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isCurator && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/music/curator/queue">
                <Icon className="text-body-md" name="file-text">
                  Review Queue
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isCurator && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/music/curator/duplicates">
                <Icon className="text-body-md" name="arrows-right-left">
                  Duplicates
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isCurator && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/music/curator/genres">
                <Icon className="text-body-md" name="file-text">
                  Genres
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isCurator && (
            <DropdownMenuItem
              className="min-h-11"
              onSelect={() => {
                if (typeof discardSession !== "function") return;
                if (window.confirm("This will discard your saved session state. Continue?")) {
                  discardSession();
                }
              }}
            >
              <Icon className="text-body-md" name="trash">
                Clear saved session
              </Icon>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/admin">
                <Icon className="text-body-md" name="laptop">
                  Admin Overview
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/admin/users">
                <Icon className="text-body-md" name="avatar">
                  Admin Users
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/admin/audio-queue">
                <Icon className="text-body-md" name="file-text">
                  Audio Queue Admin
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/admin/db-backup">
                <Icon className="text-body-md" name="download">
                  Database Backups
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/music/admin/fingerprint-failures">
                <Icon className="text-body-md" name="magnifying-glass">
                  Fingerprint Failures
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/music/admin/duplicates">
                <Icon className="text-body-md" name="file-text">
                  Duplicate Audio
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/admin/youtube-cookies">
                <Icon className="text-body-md" name="file-text">
                  YouTube Cookies
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link prefetch="intent" to="/admin/fts-index">
                <Icon className="text-body-md" name="magnifying-glass">
                  FTS5 Index
                </Icon>
              </Link>
            </DropdownMenuItem>
          )}
          <Form action="/logout" method="POST" ref={formRef}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <Icon className="text-body-md" name="exit">
                  Logout
                </Icon>
              </button>
            </DropdownMenuItem>
          </Form>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
