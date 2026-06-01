import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/app/guards/ViewerRedirect.tsx", import.meta.url), "utf8");

test("viewer redirect fails closed when config permission lookup is unavailable", () => {
  assert.match(source, /import \{ useAuth \} from "@\/auth\/auth-context"/);
  assert.match(source, /const role = auth\.status\?\.role\?\.toLowerCase\(\)/);
  assert.match(source, /if \(q\.isPending \|\| q\.isLoading \|\| auth\.loading\)/);
  assert.match(source, /if \(role === "viewer"\) \{\s*return <Navigate to=\{to\} replace \/>;\s*\}/);

  const configErrorBranch = source.slice(source.indexOf("if (q.isError)"), source.indexOf("if (q.data?.dashboardRole"));
  assert.match(configErrorBranch, /if \(role === "admin"\) \{\s*return <>\{children\}<\/>;\s*\}/);
  assert.match(configErrorBranch, /已暂时阻止访问/);
  assert.doesNotMatch(configErrorBranch, /临时允许进入/);
});
