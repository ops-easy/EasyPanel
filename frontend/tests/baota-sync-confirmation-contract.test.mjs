import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Baota manual ingress sync requires explicit backend confirmation before resource access", () => {
  const source = read("../../backend/api/baota/service/sync.go");
  assert.match(
    source,
    /requireBaotaMutationConfirm\(c,\s*baotaMutationConfirmedValue\(body\["confirm"\]\),\s*"Baota ingress sync run"\)/,
  );
});

test("Baota manual ingress sync frontend sends explicit confirmation semantics", () => {
  const helper = read("../src/features/baota/lib/baotaMutationConfirm.ts");
  const page = read("../src/features/baota/pages/BaotaSync.tsx");

  assert.match(helper, /withBaotaMutationConfirm/);
  assert.doesNotMatch(helper, /confirmBaotaMutation/);
  assert.doesNotMatch(helper, /window\.confirm/);
  assert.match(page, /from "@\/features\/baota\/lib\/baotaMutationConfirm"/);
  assert.match(page, /ConfirmActionButton/);
  assert.doesNotMatch(page, /confirmBaotaMutation|window\.confirm|\bconfirm\s*\(/);
  assert.match(page, /withBaotaMutationConfirm\(\{\}\)/);
});
