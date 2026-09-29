import { Outlet } from "react-router";
import { type BreadcrumbHandle } from "#app/components/breadcrumbs.tsx";
import { Icon } from "#app/components/ui/icon.tsx";
import { requireUserId } from "#app/utils/auth.server.ts";
import { type Route } from "./+types/rooms.ts";

export const handle: BreadcrumbHandle = {
  breadcrumb: (
    <Icon name="speaker-wave" size="md">
      Rooms
    </Icon>
  ),
};

export async function loader({ request }: Route.LoaderArgs) {
  await requireUserId(request);
  return {};
}

export default function RoomsLayout() {
  return (
    <main className="container py-8 pb-24">
      <Outlet />
    </main>
  );
}
