// typescript-eslint and ts-api-utils need TypeScript's JS compiler API,
// which the native TypeScript 7 package no longer ships. Until they support
// TS 7 (https://github.com/typescript-eslint/typescript-eslint/issues/10940),
// redirect their `typescript` imports to the pinned typescript-v6 alias.
// Preloaded by the lint scripts via NODE_OPTIONS.
const Module = require("module");
const path = require("path");

const ts6Dir = path.dirname(
  require.resolve("typescript-v6/package.json", {
    paths: [path.join(__dirname, "..")],
  }),
);

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (
    (request === "typescript" || request.startsWith("typescript/")) &&
    parent &&
    /typescript-eslint|ts-api-utils/.test(parent.filename || "")
  ) {
    request = ts6Dir + request.slice("typescript".length);
  }
  return originalResolve.call(this, request, parent, ...rest);
};
