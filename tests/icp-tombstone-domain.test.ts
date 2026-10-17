import test from "node:test";
import assert from "node:assert/strict";
import { decideTombstone, exclusionIdentityKey, tombstoneReasons, withTombstoneMarker, type TombstoneLike } from "../src/domain/lead-radar/icp-tombstone";

const base = { nameNormalized: "fountain tire", address: "123 Main St SW", city: "Calgary", province: "AB", postalCode: "T2P 1J9" };

test("identity key = exact place + exact name, hashed: other place, other name, other province or no street address never collide", () => {
  const k = exclusionIdentityKey(base)!;
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.equal(exclusionIdentityKey({ ...base, address: "123  MAIN ST. SW" }), k, "punctuation, spacing and case do not change the place");
  assert.notEqual(exclusionIdentityKey({ ...base, address: "125 Main St SW" }), k);
  assert.notEqual(exclusionIdentityKey({ ...base, nameNormalized: "fountain tire northgate" }), k);
  assert.notEqual(exclusionIdentityKey({ ...base, city: "Edmonton", province: "AB", postalCode: "T5J 2Z2" }), k);
  assert.notEqual(exclusionIdentityKey({ ...base, city: "Toronto", province: "ON", postalCode: "M5H 2M9" }), k, "same street/number/name in another province is another place");
  assert.equal(exclusionIdentityKey({ ...base, address: null }), null, "no street address: only the exact source id is remembered");
  assert.equal(exclusionIdentityKey({ ...base, address: "Main St" }), null, "no civic number: not a place");
  assert.equal(exclusionIdentityKey({ ...base, nameNormalized: "" }), null);
});

const t = (o: Partial<TombstoneLike>): TombstoneLike => ({ sourceRecordId: "a", identityKey: "k", status: "ACTIVE", reasonCode: "OUTSIDE_ICP_CHAIN_OR_CORPORATE", category: "TIRE_NETWORK", brandId: "FOUNTAIN_TIRE", registryVersion: 3, ...o });
test("tombstone decisions: the exact source id decides first; a re-keyed id inherits an active exclusion or a human release; unrelated ids are untouched", () => {
  const none = new Map<string, TombstoneLike>(), noKeys = new Map<string, TombstoneLike[]>();
  assert.equal(decideTombstone("zzz", "k", none, noKeys).kind, "NONE");
  const byId = new Map([["a", t({})]]);
  assert.equal(decideTombstone("a", null, byId, noKeys).kind, "EXCLUDE");
  const rel = new Map([["a", t({ status: "RELEASED" })]]);
  assert.equal(decideTombstone("a", "k", rel, new Map([["k", [t({ sourceRecordId: "other" })]]])).kind, "OVERRIDE", "a release of THIS record beats an active tombstone of an older id");
  const byKey = new Map([["k", [t({ sourceRecordId: "old" })]]]);
  const d = decideTombstone("new", "k", none, byKey);
  assert.deepEqual([d.kind, d.kind === "EXCLUDE" && d.rekeyed], ["EXCLUDE", true]);
  assert.equal(decideTombstone("new", "other-key", none, byKey).kind, "NONE");
  assert.equal(decideTombstone("new", null, none, byKey).kind, "NONE", "no key: nothing to match");
  const released = new Map([["k", [t({ sourceRecordId: "old", status: "ACTIVE" }), t({ sourceRecordId: "old2", status: "RELEASED", releasedAt: new Date() })]]]);
  assert.equal(decideTombstone("new", "k", none, released).kind, "OVERRIDE", "a human release is inherited and outranks an active tombstone");
});

test("stored reasons: marker added once, registry version kept last", () => {
  const r = withTombstoneMarker(["OUTSIDE_ICP_CHAIN_OR_CORPORATE", "ICP_TIRE_NETWORK", "ICP_REGISTRY_V3"]);
  assert.deepEqual(r, ["OUTSIDE_ICP_CHAIN_OR_CORPORATE", "ICP_TIRE_NETWORK", "ICP_TOMBSTONE", "ICP_REGISTRY_V3"]);
  assert.deepEqual(withTombstoneMarker(r), r);
  assert.ok(tombstoneReasons(t({}), true).includes("ICP_TOMBSTONE_REKEYED"));
});
