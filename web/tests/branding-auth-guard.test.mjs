import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/app/shell/BrandingEffect.tsx", import.meta.url), "utf8");

test("BrandingEffect waits for an authenticated session before reading protected config", () => {
  assert.match(source, /import \{ useAuth \} from "@\/auth\/auth-context"/);
  assert.match(source, /const \{ status,\s*loading \} = useAuth\(\)/);
  assert.match(
    source,
    /const canLoadConfig = !loading && status !== null && \(!status\.authRequired \|\| status\.loggedIn\)/
  );
  assert.match(source, /enabled:\s*canLoadConfig/);
});
