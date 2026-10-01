const path = require("path");
const { actor, byId, createId, createService, fail, nowIso, requireFields } = require("../../shared/service-kit");

createService({
  name: "update-service",
  port: Number(process.env.UPDATE_SERVICE_PORT || 4104),
  dataFile: path.join(__dirname, "db.json"),
  seedFile: path.join(__dirname, "seed.json"),
  routes: [
    {
      method: "GET",
      path: "/updates",
      handler: ({ db, query, send }) => {
        const list = db.updates.filter((u) => !query.category || u.category === query.category);
        send(200, list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)));
      }
    },
    {
      method: "POST",
      path: "/updates",
      handler: ({ req, db, body, save, send }) => {
        if (!actor(req).staff) throw fail(403, "Only doctors or admins can publish updates");
        requireFields(body, ["title", "body"]);
        const update = { id: createId("upd"), title: body.title, body: body.body, category: body.category || "Advisory", publishedAt: nowIso() };
        db.updates.push(update);
        save();
        send(201, update);
      }
    },
    {
      method: "GET",
      path: "/notifications",
      handler: ({ req, db, query, send }) => {
        const a = actor(req);
        const list = db.notifications.filter((n) => (a.staff ? !query.patientId || n.patientId === query.patientId : n.patientId === a.id));
        send(200, list.sort((x, y) => y.createdAt.localeCompare(x.createdAt)));
      }
    },
    {
      method: "POST",
      path: "/notifications",
      handler: ({ req, db, body, save, send }) => {
        const a = actor(req);
        requireFields(body, ["patientId", "title", "message"]);
        if (!a.staff && body.patientId !== a.id) throw fail(403, "Cannot notify another patient");
        const note = { id: createId("ntf"), patientId: body.patientId, type: body.type || "general", title: body.title, message: body.message, read: false, createdAt: nowIso() };
        db.notifications.push(note);
        save();
        send(201, note);
      }
    },
    {
      method: "PATCH",
      path: "/notifications/:id/read",
      handler: ({ req, db, params, save, send }) => {
        const note = byId(db.notifications, params.id);
        if (!note) throw fail(404, "Notification not found");
        if (note.patientId !== actor(req).id) throw fail(403, "Not your notification");
        note.read = true;
        save();
        send(200, note);
      }
    },
    {
      method: "GET",
      path: "/stats",
      handler: ({ db, send }) => {
        send(200, { service: "update-service", updates: db.updates.length, unreadNotifications: db.notifications.filter((n) => !n.read).length });
      }
    }
  ]
});
