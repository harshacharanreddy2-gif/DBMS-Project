const { spawn } = require("child_process");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const ports = { patient: 4101, appointment: 4102, prescription: 4103, update: 4104 };
const env = {
  ...process.env,
  GATEWAY_PORT: process.env.GATEWAY_PORT || "4000",
  JWT_SECRET: process.env.JWT_SECRET || "development-demo-secret"
};

for (const [name, port] of Object.entries(ports)) {
  const key = name.toUpperCase();
  env[`${key}_SERVICE_PORT`] = process.env[`${key}_SERVICE_PORT`] || String(port);
  env[`${key}_SERVICE_URL`] = process.env[`${key}_SERVICE_URL`] || `http://localhost:${port}`;
}

const targets = [
  ...Object.keys(ports).map((n) => [`${n}-service`, `services/${n}-service/server.js`]),
  ["api-gateway", "gateway/server.js"]
];

const children = targets.map(([name, script]) => {
  const child = spawn(process.execPath, [path.join(rootDir, script)], { cwd: rootDir, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (c) => process.stdout.write(`[${name}] ${c}`));
  child.stderr.on("data", (c) => process.stderr.write(`[${name}] ${c}`));
  child.on("exit", (code) => code && console.error(`[${name}] exited with code ${code}`));
  return child;
});

const shutdown = () => {
  children.forEach((c) => !c.killed && c.kill("SIGTERM"));
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("CareConnect starting...");
console.log(`Open http://localhost:${env.GATEWAY_PORT}`);
