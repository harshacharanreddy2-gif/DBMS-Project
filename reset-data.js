const fs = require("fs");
const path = require("path");
const { readJson, writeJson } = require("../shared/service-kit");

const serviceDirs = ["patient-service", "appointment-service", "prescription-service", "update-service"];

for (const serviceDir of serviceDirs) {
  const dir = path.join(__dirname, "..", "services", serviceDir);
  const seedPath = path.join(dir, "seed.json");
  const dbPath = path.join(dir, "db.json");

  if (!fs.existsSync(seedPath)) {
    console.warn(`No seed found for ${serviceDir}`);
    continue;
  }

  writeJson(dbPath, readJson(seedPath, {}));
  console.log(`Reset ${serviceDir}`);
}
