"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createJsonFileRecordPersistence({
  filePath,
} = {}) {
  const resolvedFilePath = path.resolve(filePath || path.resolve(__dirname, "../data/user-functions.json"));

  function loadRecords() {
    if (!fs.existsSync(resolvedFilePath)) {
      return [];
    }

    const source = fs.readFileSync(resolvedFilePath, "utf8").trim();

    if (!source) {
      return [];
    }

    const records = JSON.parse(source);

    if (!Array.isArray(records)) {
      throw new TypeError("Persisted user function data must be a JSON array.");
    }

    return records;
  }

  function saveRecords(records) {
    fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
    fs.writeFileSync(resolvedFilePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  return Object.freeze({
    filePath: resolvedFilePath,
    loadRecords,
    saveRecords,
  });
}

module.exports = {
  createJsonFileRecordPersistence,
};
