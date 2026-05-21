"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const entryFile = path.resolve(projectRoot, "web", "runtime-entry.js");
const outputFile = path.resolve(projectRoot, "web-vue", "public", "calculator-runtime.js");
const globalName = "CalculatorRuntime";

function toProjectId(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/gu, "/");
}

function resolveModulePath(fromFile, request) {
  if (!request.startsWith(".")) {
    throw new Error(`Only relative requires are supported in browser bundle: ${request}`);
  }

  const basePath = path.resolve(path.dirname(fromFile), request);
  const candidates = [
    basePath,
    `${basePath}.js`,
    path.join(basePath, "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(`Cannot resolve module "${request}" from "${fromFile}"`);
}

function parseRequires(source) {
  const pattern = /require\((["'])(.+?)\1\)/gu;
  const requests = [];
  let match = pattern.exec(source);

  while (match) {
    requests.push(match[2]);
    match = pattern.exec(source);
  }

  return requests;
}

function collectModules(filePath, collected = new Map()) {
  const normalizedPath = path.resolve(filePath);

  if (collected.has(normalizedPath)) {
    return collected;
  }

  const source = fs.readFileSync(normalizedPath, "utf8");
  const dependencyRequests = parseRequires(source);
  const dependencies = {};

  collected.set(normalizedPath, {
    id: toProjectId(normalizedPath),
    filePath: normalizedPath,
    source,
    dependencies,
  });

  for (const request of dependencyRequests) {
    const resolvedPath = resolveModulePath(normalizedPath, request);
    dependencies[request] = toProjectId(resolvedPath);
    collectModules(resolvedPath, collected);
  }

  return collected;
}

function buildBundleSource(modules, entryId, runtimeGlobal) {
  const moduleEntries = Array.from(modules.values()).sort((left, right) => left.id.localeCompare(right.id));
  const moduleTable = moduleEntries
    .map(
      (module) => `    "${module.id}": [
      function(module, exports, require) {
${module.source
  .split("\n")
  .map((line) => `        ${line}`)
  .join("\n")}
      },
      ${JSON.stringify(module.dependencies, null, 2).replace(/^/gmu, "      ")}
    ]`
    )
    .join(",\n");

  return `(function(modules, entryId, runtimeGlobal) {
  var cache = {};

  function requireModule(id) {
    if (cache[id]) {
      return cache[id].exports;
    }

    if (!modules[id]) {
      throw new Error("Module not found in browser bundle: " + id);
    }

    var module = { exports: {} };
    cache[id] = module;

    var factory = modules[id][0];
    var dependencies = modules[id][1];

    function localRequire(request) {
      if (!dependencies[request]) {
        throw new Error("Unknown dependency '" + request + "' from module " + id);
      }

      return requireModule(dependencies[request]);
    }

    factory(module, module.exports, localRequire);
    return module.exports;
  }

  var entry = requireModule(entryId);

  if (typeof window !== "undefined") {
    window[runtimeGlobal] = entry;
  }
})(
  {
${moduleTable}
  },
  ${JSON.stringify(entryId)},
  ${JSON.stringify(runtimeGlobal)}
);
`;
}

function buildWebVueRuntime() {
  const modules = collectModules(entryFile);
  const bundleSource = buildBundleSource(modules, toProjectId(entryFile), globalName);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, bundleSource, "utf8");

  return {
    moduleCount: modules.size,
    outputFile,
  };
}

if (require.main === module) {
  const result = buildWebVueRuntime();
  process.stdout.write(
    `Web Vue runtime built: ${path.relative(projectRoot, result.outputFile)} (${result.moduleCount} modules)\n`
  );
}

module.exports = {
  buildWebVueRuntime,
};
