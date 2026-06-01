import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Harbor backend write handlers require explicit confirmation before resource access", () => {
  const handlers = read("../../backend/api/harbor/service/handlers.go");
  const indexHandlers = read("../../backend/api/harbor/service/index_handlers.go");

  assert.match(
    indexHandlers,
    /requireHarborMutationConfirm\(c,\s*harborMutationConfirmedValue\(body\["confirm"\]\),\s*"Harbor image index sync"\)/,
  );
  assert.match(
    handlers,
    /requireHarborMutationConfirm\(c,\s*harborMutationConfirmed\(c\.Query\("confirm"\)\),\s*"Harbor artifact delete"\)/,
  );
});

test("Harbor frontend mutations send explicit confirmation semantics", () => {
  const helper = read("../src/features/harbor/lib/harborMutationConfirm.ts");
  const artifacts = read("../src/features/harbor/pages/HarborArtifactsPage.tsx");
  const indexPanel = read("../src/features/harbor/components/HarborRedisIndexSettingsPanel.tsx");

  assert.match(helper, /withHarborMutationConfirm/);
  assert.match(helper, /withHarborMutationConfirmQuery/);
  assert.doesNotMatch(helper, /confirmHarborMutation/);
  assert.doesNotMatch(helper, /window\.confirm/);

  assert.match(artifacts, /from "@\/features\/harbor\/lib\/harborMutationConfirm"/);
  assert.match(artifacts, /ConfirmActionButton/);
  assert.doesNotMatch(artifacts, /confirmHarborMutation|window\.confirm|\bconfirm\s*\(/);
  assert.match(artifacts, /withHarborMutationConfirmQuery\(/);

  assert.match(indexPanel, /from "@\/features\/harbor\/lib\/harborMutationConfirm"/);
  assert.match(indexPanel, /ConfirmActionButton/);
  assert.doesNotMatch(indexPanel, /confirmHarborMutation|window\.confirm|\bconfirm\s*\(/);
  assert.match(indexPanel, /withHarborMutationConfirm\(\{\}\)/);
});
