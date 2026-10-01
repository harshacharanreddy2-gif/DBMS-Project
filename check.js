const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.isDirectory()) return ["node_modules", ".git"].includes(e.name) ? [] : walk(path.join(dir, e.name));
  return e.name.endsWith(".js") ? [path.join(dir, e.name)] : [];
});

let failed = 0;
for (const file of walk(path.join(__dirname, ".."))) {
  const result = spawnSync(process.execPath, ["--check", file]);
  if (result.status) { failed = 1; console.error(file, String(result.stderr)); }
}
console.log(failed ? "Syntax check failed" : "Syntax check passed");
process.exit(failed);
