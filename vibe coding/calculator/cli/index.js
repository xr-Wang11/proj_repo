"use strict";

const readline = require("node:readline");
const { createCliSession } = require("./session");
const { createJsonFileRecordPersistence } = require("./user-function-storage");

function startCli(options = {}) {
  const session = createCliSession({
    persistence: options.persistence || createJsonFileRecordPersistence({
      filePath: options.userFunctionFilePath,
    }),
    ...options,
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "calc> ",
  });

  process.stdout.write("LaTeX Calculator CLI\n");
  process.stdout.write("输入 :help 查看命令。\n");
  rl.prompt();

  rl.on("line", (line) => {
    const response = session.executeLine(line);

    for (const outputLine of response.lines) {
      process.stdout.write(`${outputLine}\n`);
    }

    if (response.kind === "exit") {
      rl.close();
      return;
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.stdout.write("会话结束。\n");
  });

  return rl;
}

if (require.main === module) {
  startCli();
}

module.exports = {
  startCli,
};
