(() => {
  const $ = (s) => document.querySelector(s);
  const root = $("#app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (d) => new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const pill = (t) => `<span class="pill ${esc(t).toLowerCase()}">${esc(t)}</span>`;
  const empty = (t) => `<p class="muted center">${t}</p>`;
  const demo = { patient: ["asha.mehta@example.com", "patient123"], doctor: ["dr.rao@clinic.test", "doctor123"], admin: ["admin@clinic.test", "admin123"] };
  const tabs = [["home", "🏠", "Home"], ["appointments", "📅", "Visits"], ["prescriptions", "💊", "Rx"], ["records", "🩺", "Records"], ["updates", "🔔", "Updates"]];
  const keys = ["patients", "appointments", "prescriptions", "updates", "notifications", "doctors"];
  const S = { token: localStorage.getItem("cc-token") || "", user: JSON.parse(localStorage.getItem("cc-user") || "null"), tab: "home", pid: "", down: [], d: {} };
  const staff = () => S.user && S.user.role !== "patient";

  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.className = "show";
    setTimeout(() => (t.className = ""), 2500);
  }

  async function api(path, method = "GET", body) {
    const res = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + S.token },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && S.token) logout();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function load() {
    const results = await Promise.allSettled(keys.map((k) => api("/" + k)));
    S.down = [];
    keys.forEach((k, i) => {
      const ok = results[i].status === "fulfilled";
      S.d[k] = ok ? results[i].value : [];
      if (!ok) S.down.push(k);
    });
    if (!S.d.patients.some((p) => p.id === S.pid)) S.pid = (S.d.patients[0] || {}).id || "";
  }

  const views = {
    home() {
      const next = S.d.appointments.find((a) => a.status === "Scheduled");
      const active = S.d.prescriptions.filter((p) => p.status === "Active").length;
      const unread = S.d.notifications.filter((n) => !n.read).length;
      const u = S.d.updates[0];
      return `<h2>Hello, ${esc(S.user.name)} 👋</h2>
        <div class="card hero">${next
          ? `<small>Next appointment</small><h3>${esc(next.doctorName)}</h3><p>${fmt(next.date)} · ${esc(next.time)}${staff() ? " · " + esc(next.patientName) : ""}</p>`
          : "<h3>No upcoming appointments</h3>"}</div>
        <div class="row"><div class="card stat"><b>${active}</b><small>Active prescriptions</small></div><div class="card stat"><b>${unread}</b><small>Unread alerts</small></div></div>
        ${u ? `<div class="card"><small>${esc(u.category)}</small><h4>${esc(u.title)}</h4><p>${esc(u.body)}</p></div>` : ""}`;
    },
    appointments() {
      const list = S.d.appointments.map((a) => `<div class="card"><div class="between"><h4>${esc(a.doctorName)}</h4>${pill(a.status)}</div>
        <p>${fmt(a.date)} · ${esc(a.time)} · ${esc(a.specialization)}</p>
        ${staff() ? `<p class="muted">Patient: ${esc(a.patientName)}</p>` : ""}${a.reason ? `<p class="muted">${esc(a.reason)}</p>` : ""}
        ${a.status === "Scheduled" ? `<div class="between"><button class="ghost" data-act="cancel" data-id="${a.id}">Cancel</button>${staff() ? `<button data-act="done" data-id="${a.id}">Mark done</button>` : ""}</div>` : ""}</div>`).join("");
      const form = staff() ? "" : `<div class="card"><h4>Book an appointment</h4>
        <select id="bk-doc">${S.d.doctors.map((d) => `<option value="${d.id}">${esc(d.name)} — ${esc(d.specialization)}</option>`).join("")}</select>
        <input id="bk-date" type="date" min="${new Date().toISOString().slice(0, 10)}">
        <select id="bk-time"><option value="">Pick a date first</option></select>
        <input id="bk-reason" placeholder="Reason for visit"><button data-act="book">Book</button></div>`;
      return `${form}<h3>${staff() ? "Appointments" : "Your appointments"}</h3>${list || empty("No appointments yet")}`;
    },
    prescriptions() {
      return S.d.prescriptions.map((p) => `<div class="card"><div class="between"><h4>${esc(p.diagnosis)}</h4>${pill(p.status)}</div>
        <p class="muted">${esc(p.doctorName)} · ${fmt(p.issuedDate)}${staff() ? " · " + esc(p.patientName) : ""}</p>
        <ul>${p.medicines.map((m) => `<li><b>${esc(m.name)}</b> ${esc(m.dosage)} — ${esc(m.frequency)}${m.days ? ` for ${m.days} days` : ""}</li>`).join("")}</ul>
        ${p.notes ? `<p class="muted">${esc(p.notes)}</p>` : ""}
        ${!staff() && p.status === "Active" ? (p.refillRequested ? pill("Refill requested") : `<button data-act="refill" data-id="${p.id}">Request refill</button>`) : ""}</div>`).join("") || empty("No prescriptions");
    },
    records() {
      const p = S.d.patients.find((x) => x.id === S.pid);
      if (!p) return empty("No patient record available");
      const m = p.medical || {};
      const chips = (a) => (a && a.length ? a.map((x) => `<span class="chip">${esc(x)}</span>`).join("") : '<span class="muted">None recorded</span>');
      const picker = staff() ? `<select id="pid">${S.d.patients.map((x) => `<option value="${x.id}" ${x.id === S.pid ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : "";
      return `${picker}<div class="card"><h3>${esc(p.name)}</h3><p class="muted">DOB ${fmt(p.dob)} · Blood group <b>${esc(m.bloodGroup || "—")}</b></p>
        <small>Allergies</small><div>${chips(m.allergies)}</div><small>Conditions</small><div>${chips(m.conditions)}</div></div>
        <h3>Vitals</h3><div class="card"><table><tr><th>Date</th><th>BP</th><th>Pulse</th><th>Wt (kg)</th></tr>
        ${(m.vitals || []).slice().reverse().map((v) => `<tr><td>${fmt(v.date)}</td><td>${esc(v.bp)}</td><td>${esc(v.pulse)}</td><td>${esc(v.weightKg ?? "—")}</td></tr>`).join("")}</table></div>
        <h3>Lab reports</h3>${(m.reports || []).slice().reverse().map((r) => `<div class="card"><div class="between"><h4>${esc(r.name)}</h4>${pill(r.status)}</div><p>${esc(r.result)}</p><p class="muted">${fmt(r.date)}</p></div>`).join("") || empty("No reports")}`;
    },
    updates() {
      const notes = S.d.notifications.map((n) => `<div class="card ${n.read ? "" : "unread"}"><h4>${esc(n.title)}</h4><p>${esc(n.message)}</p>
        ${!n.read && !staff() ? `<button class="ghost" data-act="read" data-id="${n.id}">Mark read</button>` : ""}</div>`).join("");
      const ups = S.d.updates.map((u) => `<div class="card"><small>${esc(u.category)} · ${fmt(u.publishedAt)}</small><h4>${esc(u.title)}</h4><p>${esc(u.body)}</p></div>`).join("");
      return `<h3>Alerts</h3>${notes || empty("No alerts")}<h3>Health updates</h3>${ups || empty("No updates")}`;
    }
  };

  function loginView() {
    root.innerHTML = `<div class="login"><h1>🩺 CareConnect</h1><p class="muted">Appointments, prescriptions and records in one place.</p>
      <input id="em" placeholder="Email" autocomplete="username"><input id="pw" type="password" placeholder="Password" autocomplete="current-password">
      <button data-act="login" style="width:100%">Sign in</button><p class="muted center">Demo accounts</p>
      <div class="row">${Object.keys(demo).map((k) => `<button class="ghost" data-act="demo" data-id="${k}">${k}</button>`).join("")}</div></div>`;
  }

  function render() {
    if (!S.token) return loginView();
    root.innerHTML = `<header><span>🩺 CareConnect</span><button class="ghost light" data-act="logout">Logout</button></header>
      <main>${S.down.length ? `<div class="warn">Some services are unavailable: ${S.down.join(", ")}</div>` : ""}${views[S.tab]()}</main>
      <nav>${tabs.map(([id, icon, label]) => `<button class="${S.tab === id ? "on" : ""}" data-act="tab" data-id="${id}"><span>${icon}</span>${label}</button>`).join("")}</nav>`;
  }

  async function refresh() { await load(); render(); }

  async function signIn(email, password) {
    const r = await api("/auth/login", "POST", { email, password });
    S.token = r.token;
    S.user = r.user;
    S.tab = "home";
    localStorage.setItem("cc-token", r.token);
    localStorage.setItem("cc-user", JSON.stringify(r.user));
    await refresh();
  }

  function logout() {
    localStorage.removeItem("cc-token");
    localStorage.removeItem("cc-user");
    S.token = "";
    S.user = null;
    render();
  }

  async function setStatus(id, status) {
    await api(`/appointments/${id}/status`, "PATCH", { status });
    toast(`Appointment ${status.toLowerCase()}`);
    await refresh();
  }

  const act = {
    login: () => signIn($("#em").value, $("#pw").value),
    demo: ({ id }) => signIn(...demo[id]),
    logout,
    tab: ({ id }) => { S.tab = id; render(); },
    cancel: ({ id }) => setStatus(id, "Cancelled"),
    done: ({ id }) => setStatus(id, "Completed"),
    refill: async ({ id }) => { await api(`/prescriptions/${id}/refill`, "PATCH", {}); toast("Refill requested"); await refresh(); },
    read: async ({ id }) => { await api(`/notifications/${id}/read`, "PATCH", {}); await refresh(); },
    book: async () => {
      await api("/appointments", "POST", { doctorId: $("#bk-doc").value, date: $("#bk-date").value, time: $("#bk-time").value, reason: $("#bk-reason").value });
      toast("Appointment booked");
      await refresh();
    }
  };

  async function loadSlots() {
    const doc = $("#bk-doc").value, date = $("#bk-date").value;
    if (!doc || !date) return;
    const r = await api(`/doctors/${doc}/slots?date=${date}`);
    $("#bk-time").innerHTML = r.slots.length ? r.slots.map((t) => `<option>${t}</option>`).join("") : '<option value="">No slots that day</option>';
  }

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    try { await act[b.dataset.act](b.dataset); } catch (err) { toast(err.message); }
  });
  root.addEventListener("change", async (e) => {
    try {
      if (e.target.id === "bk-doc" || e.target.id === "bk-date") await loadSlots();
      if (e.target.id === "pid") { S.pid = e.target.value; render(); }
    } catch (err) { toast(err.message); }
  });

  if (S.token) refresh().catch(() => render()); else render();
})();
