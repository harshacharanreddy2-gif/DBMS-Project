const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const { requestJson } = require("../shared/service-kit");

const base = "http://localhost:4000";
let child;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (cond, msg) => { if (!cond) throw new Error(`FAILED: ${msg}`); console.log(`ok  ${msg}`); };

async function login(email, password) {
  const r = await requestJson(`${base}/api/auth/login`, { method: "POST", body: { email, password } });
  check(r.ok && r.json.token, `login ${email}`);
  return { Authorization: `Bearer ${r.json.token}` };
}

function nextWeekday() {
  const d = new Date(Date.now() + 14 * 864e5);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function run() {
  child = spawn(process.execPath, [path.join(__dirname, "start-all.js")], { stdio: "ignore" });
  for (let i = 0; i < 40; i += 1) {
    try { if ((await requestJson(`${base}/api/service-status`, { timeoutMs: 800 })).ok) break; } catch (e) { await sleep(250); }
  }

  const patient = await login("asha.mehta@example.com", "patient123");
  const doctor = await login("dr.rao@clinic.test", "doctor123");
  const admin = await login("admin@clinic.test", "admin123");
  const get = (p, headers) => requestJson(`${base}/api${p}`, { headers });

  const mine = await get("/patients", patient);
  check(mine.json.length === 1 && !mine.json[0].password, "patient sees only own record (no password leaked)");
  check((await get("/patients/pat-1002", patient)).status === 403, "patient blocked from another patient's record");
  check((await get("/patients", doctor)).json.length === 2, "doctor can list patients");
  check((await get("/overview", patient)).status === 403, "overview is staff-only");
  check((await get("/overview", admin)).ok, "admin overview aggregates services");
  check((await get("/prescriptions", patient)).json.every((r) => r.patientId === "pat-1001"), "prescriptions scoped to patient");

  const date = nextWeekday();
  const book = { doctorId: "doc-1001", date, time: "09:00", reason: "Smoke test" };
  const booked = await requestJson(`${base}/api/appointments`, { method: "POST", headers: patient, body: book });
  check(booked.status === 201, "patient books appointment");
  check((await requestJson(`${base}/api/appointments`, { method: "POST", headers: patient, body: book })).status === 409, "double booking rejected");
  const slots = await get(`/doctors/doc-1001/slots?date=${date}`, patient);
  check(!slots.json.slots.includes("09:00"), "booked slot removed from availability");
  await sleep(400);
  check((await get("/notifications", patient)).json.some((n) => n.title === "Appointment confirmed" && n.message.includes(date)), "booking created a notification (service-to-service)");
  check((await requestJson(`${base}/api/appointments/${booked.json.id}/status`, { method: "PATCH", headers: patient, body: { status: "Cancelled" } })).ok, "patient cancels own appointment");

  const rx = { patientId: "pat-1001", diagnosis: "Test", doctorName: "Dr. Meera Rao", medicines: [{ name: "Ibuprofen", dosage: "200 mg", frequency: "Twice daily", days: 3 }] };
  check((await requestJson(`${base}/api/prescriptions`, { method: "POST", headers: patient, body: rx })).status === 403, "patient cannot issue prescriptions");
  check((await requestJson(`${base}/api/prescriptions`, { method: "POST", headers: doctor, body: { ...rx, medicines: [{ name: "Penicillin V", dosage: "250 mg" }] } })).status === 409, "allergy check blocks unsafe prescription");
  const issued = await requestJson(`${base}/api/prescriptions`, { method: "POST", headers: doctor, body: rx });
  check(issued.status === 201, "doctor issues prescription");
  check((await requestJson(`${base}/api/prescriptions/${issued.json.id}/refill`, { method: "PATCH", headers: patient, body: {} })).ok, "patient requests refill");

  const html = await new Promise((resolve, reject) => http.get(base, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, b })); }).on("error", reject));
  check(html.status === 200 && html.b.includes('id="app"'), "frontend served");
  console.log("\nSmoke test passed.");
}

run().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => child && child.kill("SIGTERM"));
