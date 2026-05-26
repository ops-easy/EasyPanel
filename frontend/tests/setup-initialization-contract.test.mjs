import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const gateSource = readFileSync(new URL("../src/app/guards/SetupGate.tsx", import.meta.url), "utf8");
const setupSource = readFileSync(new URL("../src/pages/Setup.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");

test("SetupStatus mirrors the backend setup status contract", () => {
  const typeMatch = apiSource.match(/export type SetupStatus = \{(?<body>[\s\S]*?)\};/);
  assert.ok(typeMatch?.groups?.body, "SetupStatus type is missing");
  const body = typeMatch.groups.body;
  for (const field of ["initialized", "dataDir", "version", "configMode"]) {
    assert.match(body, new RegExp(`\\b${field}\\b`), `SetupStatus should expose ${field}`);
  }
});

test("App keeps setup guarded at the root entry before authenticated routes", () => {
  assert.match(appSource, /import SetupGate from "@\/app\/guards\/SetupGate"/);
  assert.match(appSource, /const Setup = lazy\(\(\) => import\("@\/pages\/Setup"\)\)/);
  assert.match(
    appSource,
    /<Route element=\{<SetupGate \/>\}>[\s\S]*<Route path="\/setup"[\s\S]*<Route path="\/login"[\s\S]*<Route element=\{<RequireAuth \/>\}>/,
    "SetupGate should wrap /setup, /login and authenticated routes"
  );
});

test("SetupGate polls setup status and preserves both redirect directions", () => {
  assert.match(gateSource, /queryKey:\s*\["setup-status"\]/);
  assert.match(gateSource, /apiGetJson<SetupStatus>\("\/api\/setup\/status"/);
  assert.match(gateSource, /!data\.initialized\s*&&\s*loc\.pathname\s*!==\s*"\/setup"/);
  assert.match(gateSource, /<Navigate to="\/setup" replace \/>/);
  assert.match(gateSource, /data\?\.initialized\s*&&\s*loc\.pathname\s*===\s*"\/setup"/);
  assert.match(gateSource, /<Navigate to="\/login" replace \/>/);
});

test("Setup page keeps the initialization API smoke chain intact", () => {
  assert.match(setupSource, /apiGetJson<SetupStatus>\("\/api\/setup\/status"\)/);
  assert.match(setupSource, /apiPostJson\("\/api\/setup", body\)/);
  assert.match(setupSource, /invalidateQueries\(\{ queryKey:\s*\["setup-status"\] \}\)/);
  assert.match(setupSource, /window\.location\.assign\("\/login"\)/);

  for (const field of [
    "platformPublicUrl",
    "mysqlHost",
    "mysqlPort",
    "mysqlDatabase",
    "mysqlUser",
    "mysqlPassword",
    "redisHost",
    "redisPort",
    "redisAddr",
    "encryptionKey",
    "dashboardUser",
    "dashboardPasswordPlain",
    "k8s",
  ]) {
    assert.match(setupSource, new RegExp(`\\b${field}\\b`), `setup payload should include ${field}`);
  }
});
