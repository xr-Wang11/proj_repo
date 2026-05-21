"use strict";

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.resolve(projectRoot, "web-vue", "dist");
const htmlTemplateFile = path.resolve(distDir, "index.html");
const standaloneHtmlFile = path.resolve(distDir, "index.standalone.html");

function ensureDistExists() {
  if (!fs.existsSync(distDir)) {
    throw new Error("web-vue/dist was not found. Please run npm.cmd run build in web-vue first.");
  }

  if (!fs.existsSync(htmlTemplateFile)) {
    throw new Error("web-vue/dist/index.html was not found. Please run npm.cmd run build in web-vue first.");
  }
}

function resolveDistAssetPath(assetRef) {
  const normalizedRef = String(assetRef ?? "").trim();

  if (!normalizedRef) {
    throw new Error("Asset reference is empty.");
  }

  if (/^(https?:)?\/\//iu.test(normalizedRef)) {
    throw new Error(`External asset is not supported for standalone export: ${normalizedRef}`);
  }

  const absolutePath = path.resolve(distDir, normalizedRef);

  if (!absolutePath.startsWith(distDir)) {
    throw new Error(`Asset path escapes dist directory: ${normalizedRef}`);
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`Standalone asset was not found: ${normalizedRef}`);
  }

  return absolutePath;
}

function escapeInlineScript(source) {
  return source.replace(/<\/script/giu, "<\\/script");
}

function escapeInlineStyle(source) {
  return source.replace(/<\/style/giu, "<\\/style");
}

function inlineStyles(htmlSource) {
  return htmlSource.replace(
    /<link\s+([^>]*?)rel="stylesheet"([^>]*?)href="([^"]+)"([^>]*?)>/giu,
    (fullMatch, beforeRel, betweenRelAndHref, href, afterHref) => {
      const assetPath = resolveDistAssetPath(href);
      const cssSource = fs.readFileSync(assetPath, "utf8");
      return `<style data-inline-href="${href}">\n${escapeInlineStyle(cssSource)}\n</style>`;
    }
  );
}

function inlineScripts(htmlSource) {
  let nextSource = htmlSource.replace(
    /<script\s+([^>]*?)type="module"([^>]*?)src="([^"]+)"([^>]*?)><\/script>/giu,
    (fullMatch, beforeType, betweenTypeAndSrc, src, afterSrc) => {
      const assetPath = resolveDistAssetPath(src);
      const scriptSource = fs.readFileSync(assetPath, "utf8");
      return `<script type="module" data-inline-src="${src}">\n${escapeInlineScript(scriptSource)}\n</script>`;
    }
  );

  nextSource = nextSource.replace(
    /<script\s+([^>]*?)src="([^"]+)"([^>]*?)><\/script>/giu,
    (fullMatch, beforeSrc, src, afterSrc) => {
      const assetPath = resolveDistAssetPath(src);
      const scriptSource = fs.readFileSync(assetPath, "utf8");
      return `<script data-inline-src="${src}">\n${escapeInlineScript(scriptSource)}\n</script>`;
    }
  );

  return nextSource;
}

function buildWebVueStandaloneHtml() {
  ensureDistExists();

  const htmlTemplate = fs.readFileSync(htmlTemplateFile, "utf8");
  const inlinedStyles = inlineStyles(htmlTemplate);
  const standaloneSource = inlineScripts(inlinedStyles);

  fs.writeFileSync(standaloneHtmlFile, standaloneSource, "utf8");

  return {
    outputFile: standaloneHtmlFile,
  };
}

if (require.main === module) {
  const result = buildWebVueStandaloneHtml();
  process.stdout.write(
    `Vue standalone HTML built: ${path.relative(projectRoot, result.outputFile)}\n`
  );
}

module.exports = {
  buildWebVueStandaloneHtml,
};
