import { NavLink, useLocation, useNavigate } from "react-router";
import { Icon } from "#app/components/ui/icon.tsx";
import { cn } from "#app/utils/misc.tsx";

interface TabConfig {
  label: string;
  icon: string;
  to: string;
  ariaLabel?: string;
}

const tabs: TabConfig[] = [
  { label: "Home", icon: "home", to: "/", ariaLabel: "Home page" },
  { label: "Discover", icon: "globe", to: "/discover", ariaLabel: "Discover music" },
  { label: "Search", icon: "magnifying-glass", to: "/search", ariaLabel: "Search music" },
  { label: "My Library", icon: "file-text", to: "/library", ariaLabel: "My music library" },
  { label: "My Playlists", icon: "list-bullet", to: "/playlists", ariaLabel: "My playlists" },
  { label: "History", icon: "clock", to: "/history", ariaLabel: "Listening history" },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleSearchClick = (e: React.MouseEvent) => {
    e.preventDefault();
    void navigate("/search");
  };

  const isTabActive = (tabTo: string) => {
    if (tabTo === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(tabTo);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-51 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      role="navigation"
      aria-label="Main navigation"
    >
      <ul className="flex h-16 items-center justify-around">
        {tabs.map((tab) => {
          const isActive = isTabActive(tab.to);
          return (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === "/"}
                onClick={tab.to === "/search" ? handleSearchClick : undefined}
                aria-label={tab.ariaLabel || tab.label}
                aria-current={isActive ? "page" : undefined}
                prefetch="intent"
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  name={tab.icon as Parameters<typeof Icon>[0]["name"]}
                  size="lg"
                  className={cn(isActive && "text-foreground")}
                />
                <span>{tab.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
