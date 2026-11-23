import test from "node:test";
import assert from "node:assert/strict";
import { patchDb } from "./helpers/db-mock";
import { canManageOrganizationBilling, isOrganizationLevelUser } from "../src/lib/organization";

function org(t: Parameters<typeof patchDb>[0], opts: { homeShop: string; subscription?: boolean; grants?: string[] }) {
  patchDb(t, "shop", "findUnique", (async ({ where }: { where: { id: string } }) => ({
    id: where.id, name: where.id, organizationId: "org1", subscription: opts.subscription ? { id: "sub" } : null,
  })) as never);
  patchDb(t, "shop", "findFirst", (async () => ({ id: "root" })) as never);
  patchDb(t, "userShopAccess", "findMany", (async () => (opts.grants ?? []).map((id) => ({ shop: { id, name: id, organizationId: "org1" } }))) as never);
}

test("billing: a child-location OWNER cannot manage the organization subscription; the org admin and the subscription holder can", async (t) => {
  const child = { user: { id: "u1", role: "OWNER", shopId: "child" } };
  org(t, { homeShop: "child" });
  assert.equal(await canManageOrganizationBilling(child), false);
  org(t, { homeShop: "child", grants: ["root"] });
  assert.equal(await canManageOrganizationBilling(child), true, "org admin = OWNER with access to the root");
  org(t, { homeShop: "root", subscription: true });
  assert.equal(await canManageOrganizationBilling({ user: { id: "u2", role: "OWNER", shopId: "root" } }), true);
  assert.equal(await canManageOrganizationBilling({ user: { id: "u3", role: "MECHANIC", shopId: "child" } }), false);
});

test("users: org admins and multi-location users are protected from a child-location OWNER; plain staff are not", async (t) => {
  org(t, { homeShop: "child", grants: ["root"] });
  assert.equal(await isOrganizationLevelUser({ id: "admin", role: "OWNER", shopId: "child" }), true);
  org(t, { homeShop: "child", grants: ["other"] });
  assert.equal(await isOrganizationLevelUser({ id: "m", role: "MECHANIC", shopId: "child" }), true, "has access to another location");
  org(t, { homeShop: "child" });
  assert.equal(await isOrganizationLevelUser({ id: "m2", role: "MECHANIC", shopId: "child" }), false);
  assert.equal(await isOrganizationLevelUser({ id: "o2", role: "OWNER", shopId: "child" }), false, "a plain child OWNER is not org-level");
});
