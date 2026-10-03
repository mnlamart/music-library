import { beforeEach, describe, expect, test, vi } from "vitest";
import { promoteToCurator } from "./admin-users.server.ts";

const { permissionUpsert, roleUpsert, userFindUnique, userUpdate } = vi.hoisted(() => ({
  permissionUpsert: vi.fn(),
  roleUpsert: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("#app/utils/db.server.ts", () => ({
  prisma: {
    permission: { upsert: permissionUpsert },
    role: { upsert: roleUpsert },
    user: { findUnique: userFindUnique, update: userUpdate },
  },
}));

describe("promoteToCurator when the curator role is missing", () => {
  beforeEach(() => {
    permissionUpsert.mockReset();
    roleUpsert.mockReset();
    userFindUnique.mockReset();
    userUpdate.mockReset();
    permissionUpsert.mockImplementation(async ({ create }: { create: { action: string } }) => ({
      id: `perm-${create.action}`,
    }));
    roleUpsert.mockResolvedValue({ id: "curator-role" });
    userUpdate.mockResolvedValue({ id: "user-1" });
  });

  test("creates the curator role before connecting it", async () => {
    userFindUnique.mockResolvedValue({ id: "user-1" });

    await expect(promoteToCurator("user-1")).resolves.toEqual({ ok: true });

    expect(roleUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: "curator" },
        create: expect.objectContaining({ name: "curator" }),
      }),
    );
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { roles: { connect: { name: "curator" } } },
    });
    const roleOrder = roleUpsert.mock.invocationCallOrder[0];
    const updateOrder = userUpdate.mock.invocationCallOrder[0];
    if (roleOrder === undefined || updateOrder === undefined) {
      throw new Error("expected the role upsert and user update to run");
    }
    expect(roleOrder).toBeLessThan(updateOrder);
    expect(permissionUpsert).toHaveBeenCalledTimes(7);
  });

  test("does not write when the user does not exist", async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(promoteToCurator("missing")).resolves.toEqual({
      ok: false,
      reason: "not-found",
      error: "User not found",
    });
    expect(roleUpsert).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
