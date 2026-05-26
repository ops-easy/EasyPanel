import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/shared/layout/HeaderNotificationsSheet.tsx", import.meta.url),
  "utf8"
);

test("notification sheet keeps audit actions outside the scrollable log list", () => {
  assert.match(source, /<SheetContent side="right" className="[^"]*gap-0[^"]*overflow-hidden[^"]*px-0/);
  assert.match(source, /className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4/);
  assert.match(
    source,
    /className="flex max-h-\[calc\(100vh-13rem\)\] min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm"/
  );
  assert.match(source, /className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-\[11px\] leading-snug"/);
  assert.match(source, /className="mt-2 flex shrink-0 flex-wrap gap-2 border-t border-slate-100 pt-2"/);
});
