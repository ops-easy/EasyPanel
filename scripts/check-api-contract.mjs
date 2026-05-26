#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const backendOut = path.join(repoRoot, "docs", "api-contract", "backend-routes.json");
const frontendOut = path.join(repoRoot, "docs", "api-contract", "frontend-api-uses.json");

const routeMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "Any"]);
const frontendExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

function toPosix(rel) {
  return rel.split(path.sep).join("/");
}

function walkFiles(dir, extensions) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, extensions));
      continue;
    }
    if (!extensions || extensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function lineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineNumber(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (starts[mid] <= index) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi + 1;
}

function joinRoute(base, child) {
  const left = base === "/" ? "" : base.replace(/\/+$/, "");
  const right = child === "/" ? "" : child.replace(/^\/+/, "");
  const joined = `${left}/${right}`.replace(/\/+/g, "/");
  return joined === "" ? "/" : joined;
}

function normalizeRoutePath(input) {
  let out = input.trim();
  out = out.replace(/\\\//g, "/");
  out = out.replace(/\$\{[^}]+\}/g, ":param");
  out = out.split(/[?#]/, 1)[0];
  out = out.replace(/\/+$/, "");
  return out === "" ? "/" : out;
}

function normalizeBackendPattern(input) {
  return normalizeRoutePath(input);
}

function stableRouteKey(route) {
  return `${route.method} ${route.pathPattern} ${route.sourceFile}:${route.sourceLine}`;
}

function uniqueSorted(routes) {
  const map = new Map();
  for (const route of routes) {
    const key = stableRouteKey(route);
    if (!map.has(key)) map.set(key, route);
  }
  return [...map.values()].sort((a, b) => {
    const byPath = a.pathPattern.localeCompare(b.pathPattern);
    if (byPath) return byPath;
    const byMethod = a.method.localeCompare(b.method);
    if (byMethod) return byMethod;
    return a.sourceFile.localeCompare(b.sourceFile) || a.sourceLine - b.sourceLine;
  });
}

function defaultBaseFor(name) {
  if (name === "api") return { kind: "literal", path: "/api" };
  if (name === "r" || name === "router" || name === "engine") return { kind: "literal", path: "" };
  return { kind: "unknown", path: "" };
}

function parseFunctionRanges(src) {
  const ranges = [];
  const re = /func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
  let match;
  while ((match = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    let quote = "";
    let escaped = false;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (quote) {
        if (quote !== "`" && escaped) {
          escaped = false;
        } else if (quote !== "`" && ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === `"` || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      if (depth === 0) break;
    }
    ranges.push({
      name: match[1],
      params: parseGinParams(match[2]),
      start: match.index,
      bodyStart: re.lastIndex,
      end: i,
      body: src.slice(re.lastIndex, i),
    });
    re.lastIndex = i + 1;
  }
  return ranges;
}

function parseGinParams(paramsText) {
  const params = [];
  for (const rawParam of paramsText.split(",")) {
    const part = rawParam.trim();
    if (!part.includes("gin.RouterGroup") && !part.includes("gin.Engine")) continue;
    const namesText = part.replace(/\*?gin\.(RouterGroup|Engine).*/, "").trim();
    for (const name of namesText.split(/\s+/).filter(Boolean)) {
      const base = name === "api" || name === "r" || name === "router" || name === "engine"
        ? defaultBaseFor(name)
        : { kind: "param", name, path: "" };
      params.push({ name, base });
    }
  }
  return params;
}

function findNearestFunction(functions, index) {
  return functions.find((fn) => fn.start <= index && index <= fn.end);
}

function parseGoFile(file) {
  const src = readFileSync(file, "utf8");
  const starts = lineStarts(src);
  const rel = toPosix(path.relative(repoRoot, file));
  const functions = parseFunctionRanges(src);
  const parsedFunctions = [];
  const directRoutes = [];

  for (const fn of functions) {
    const bases = new Map();
    bases.set("api", { kind: "literal", path: "/api" });
    bases.set("r", { kind: "literal", path: "" });
    for (const param of fn.params) bases.set(param.name, param.base);

    const fnRoutes = [];
    const calls = [];
    const groupRe = /(?:^|\n)\s*([A-Za-z_]\w*)\s*(?::=|=)\s*([A-Za-z_]\w*)\.Group\(\s*"([^"]+)"/g;
    let groupMatch;
    while ((groupMatch = groupRe.exec(fn.body))) {
      const parent = bases.get(groupMatch[2]) ?? defaultBaseFor(groupMatch[2]);
      bases.set(groupMatch[1], appendBase(parent, groupMatch[3]));
    }

    const routeRe = /([A-Za-z_]\w*)\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any)\(\s*"([^"]*)"/g;
    let routeMatch;
    while ((routeMatch = routeRe.exec(fn.body))) {
      const receiver = routeMatch[1];
      const method = routeMatch[2] === "Any" ? "ANY" : routeMatch[2];
      const child = routeMatch[3];
      const receiverBase = bases.get(receiver) ?? defaultBaseFor(receiver);
      const route = {
        method,
        pathPattern: normalizeBackendPattern(resolveBase(receiverBase, child).path),
        sourceFile: rel,
        sourceLine: lineNumber(starts, fn.bodyStart + routeMatch.index),
        receiver,
        base: receiverBase,
        child,
      };
      fnRoutes.push(route);
      if (receiverBase.kind === "literal") {
        directRoutes.push(stripInternalRoute(route));
      }
    }

    const callRe = /(?:^|[^\w.])([A-Za-z_]\w*)\(([^)]*)\)/g;
    let callMatch;
    while ((callMatch = callRe.exec(fn.body))) {
      const callee = callMatch[1];
      const args = callMatch[2]
        .split(",")
        .map((arg) => arg.trim())
        .map((arg) => arg.replace(/[^A-Za-z0-9_].*$/, ""))
        .filter(Boolean);
      if (args.length > 0) {
        calls.push({ callee, args, bases: new Map(bases) });
      }
    }

    parsedFunctions.push({ name: fn.name, params: fn.params, routes: fnRoutes, calls, sourceFile: rel });
  }

  return { directRoutes, functions: parsedFunctions };
}

function appendBase(base, child) {
  if (base.kind === "literal") return { kind: "literal", path: joinRoute(base.path, child) };
  if (base.kind === "param") return { kind: "param", name: base.name, path: joinRoute(base.path, child) };
  return { kind: "unknown", path: child };
}

function resolveBase(base, child) {
  if (base.kind === "literal") return { kind: "literal", path: joinRoute(base.path, child) };
  if (base.kind === "param") return { kind: "param", name: base.name, path: joinRoute(base.path, child) };
  return { kind: "unknown", path: normalizeBackendPattern(child) };
}

function stripInternalRoute(route) {
  return {
    method: route.method,
    pathPattern: route.pathPattern,
    sourceFile: route.sourceFile,
    sourceLine: route.sourceLine,
  };
}

function scanBackendRoutes() {
  const parsed = walkFiles(path.join(repoRoot, "api"), new Set([".go"]))
    .filter((file) => !file.endsWith("_test.go"))
    .map(parseGoFile);
  const routes = parsed.flatMap((item) => item.directRoutes);
  const functionMap = new Map();
  for (const item of parsed) {
    for (const fn of item.functions) {
      if (!functionMap.has(fn.name)) functionMap.set(fn.name, []);
      functionMap.get(fn.name).push(fn);
    }
  }

  for (const item of parsed) {
    for (const fn of item.functions) {
      for (const call of fn.calls) {
        const candidates = functionMap.get(call.callee) ?? [];
        if (candidates.length !== 1) continue;
        const callee = candidates[0];
        const env = new Map();
        callee.params.forEach((param, index) => {
          const argName = call.args[index];
          if (!argName) return;
          const argBase = call.bases.get(argName);
          if (argBase && argBase.kind === "literal") env.set(param.name, argBase.path);
        });
        for (const route of callee.routes) {
          if (route.base.kind === "param" && env.has(route.base.name)) {
            routes.push({
              method: route.method,
              pathPattern: normalizeBackendPattern(joinRoute(joinRoute(env.get(route.base.name), route.base.path), route.child)),
              sourceFile: route.sourceFile,
              sourceLine: route.sourceLine,
            });
          }
        }
      }
    }
  }

  return uniqueSorted(routes).filter((route) => route.pathPattern.startsWith("/api") || route.pathPattern.startsWith("/r") || route.pathPattern.startsWith("/d") || route.pathPattern === "/metrics");
}

function scanFrontendUses() {
  const files = walkFiles(path.join(repoRoot, "web", "src"), frontendExtensions);
  const uses = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const starts = lineStarts(src);
    const rel = toPosix(path.relative(repoRoot, file));
    const literalRe = /(["'`])((?:\\[\s\S]|(?!\1)[\s\S])*?)\1/g;
    let match;
    while ((match = literalRe.exec(src))) {
      const raw = match[2];
      for (const candidate of routeCandidates(raw)) {
        const pathPattern = normalizeRoutePath(candidate);
        if (!isContractPath(pathPattern)) continue;
        const before = src.slice(Math.max(0, match.index - 260), match.index);
        const after = src.slice(match.index, Math.min(src.length, literalRe.lastIndex + 240));
        const window = `${before}${after}`;
        uses.push({
          method: inferFrontendMethod(before, after),
          pathPattern,
          sourceFile: rel,
          sourceLine: lineNumber(starts, match.index),
          needsManualReview: /\$\{/.test(candidate) || /:param/.test(pathPattern),
          kind: inferFrontendKind(before, window),
        });
      }
    }
  }
  return uniqueSorted(uses);
}

function routeCandidates(raw) {
  const trimmed = raw.trim();
  const out = [];
  if (/^\/(?:api|r|d)(?:\/|$)/.test(trimmed)) {
    out.push(trimmed.split(/\s+/)[0]);
  }
  const embeddedRe = /(^|[^A-Za-z0-9_@.-])(\/(?:api|r|d)(?:\/[^\s"'`<>)\]]*)?)(?=$|[\s"'`<>)\],.;:])/g;
  let match;
  while ((match = embeddedRe.exec(raw))) {
    out.push(match[2]);
  }
  return [...new Set(out)];
}

function isContractPath(pathPattern) {
  return /^\/(?:api|r|d)(?:\/|$)/.test(pathPattern);
}

function inferFrontendMethod(before, after) {
  if (/apiDelete(?:Json)?\s*(?:<[^()]*>)?\s*\(\s*$/.test(before)) return "DELETE";
  if (/apiPatch(?:Json)?\s*(?:<[^()]*>)?\s*\(\s*$/.test(before)) return "PATCH";
  if (/apiPut(?:Json|Raw)?\s*(?:<[^()]*>)?\s*\(\s*$/.test(before)) return "PUT";
  if (/apiPost(?:Json|NoBody)?\s*(?:<[^()]*>)?\s*\(\s*$/.test(before)) return "POST";
  if (/apiGet(?:Json|Text)?\s*(?:<[^()]*>)?\s*\(\s*$/.test(before)) return "GET";
  const methodMatch = after.match(/method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)["'`]/i);
  if (methodMatch) return methodMatch[1].toUpperCase();
  if (/wsUrl\s*\(\s*$/.test(before) || /new\s+WebSocket\s*\(\s*$/.test(before)) return "GET";
  return "UNKNOWN";
}

function inferFrontendKind(before, window) {
  if (/wsUrl\s*\(\s*$/.test(before) || /new\s+WebSocket\s*\(\s*$/.test(before)) return "websocket";
  if (/api(?:Get|Post|Put|Patch|Delete)(?:Json|Text|Raw|NoBody)?\s*(?:<[^()]*>)?\s*\(\s*$/.test(before) || /fetch\s*\(/.test(window)) return "http";
  return "literal";
}

function manifestPayload(kind, routes) {
  return {
    generatedBy: "scripts/check-api-contract.mjs",
    kind,
    routeCount: routes.length,
    routes,
  };
}

function writeJSON(file, payload) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function readJSON(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertManifestCurrent(file, expected) {
  assert.ok(existsSync(file), `${toPosix(path.relative(repoRoot, file))} is missing; run node scripts/check-api-contract.mjs --write`);
  assert.deepEqual(readJSON(file), expected, `${toPosix(path.relative(repoRoot, file))} is stale; run node scripts/check-api-contract.mjs --write`);
}

const backendRoutes = manifestPayload("backend-routes", scanBackendRoutes());
const frontendUses = manifestPayload("frontend-api-uses", scanFrontendUses());
const write = process.argv.includes("--write");

if (write) {
  writeJSON(backendOut, backendRoutes);
  writeJSON(frontendOut, frontendUses);
  console.log(`wrote ${toPosix(path.relative(repoRoot, backendOut))} (${backendRoutes.routeCount} routes)`);
  console.log(`wrote ${toPosix(path.relative(repoRoot, frontendOut))} (${frontendUses.routeCount} uses)`);
} else {
  assertManifestCurrent(backendOut, backendRoutes);
  assertManifestCurrent(frontendOut, frontendUses);
  console.log(`api contract manifests are current (${backendRoutes.routeCount} backend routes, ${frontendUses.routeCount} frontend uses)`);
}
