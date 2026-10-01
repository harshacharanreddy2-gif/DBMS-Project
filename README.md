# CareConnect - Healthcare Mobile Application

A mobile-first healthcare app (view appointments, access prescriptions, check medical information, receive health updates) built on a distributed Node.js backend: API gateway + four independent services, each with its own data store. Adapted from the Society Management Platform template. Node.js 18+ only, no npm dependencies.

## Run

```bash
npm run dev            # http://localhost:4000  (open in a phone-sized browser window)
npm run test:smoke     # starts everything and runs 19 API/security checks
npm run check          # syntax check      |  npm run reset:data  # restore seed data
docker compose up      # same layout in containers
```

Demo logins: patient `asha.mehta@example.com / patient123`, doctor `dr.rao@clinic.test / doctor123`, admin `admin@clinic.test / admin123`.

## Architecture

| Component | Port | Owns |
| --- | ---: | --- |
| API Gateway + frontend | 4000 | Auth (signed token), routing, `/api/overview`, `/api/service-status` |
| patient-service | 4101 | Users, login, medical info (blood group, allergies, conditions, vitals, lab reports) |
| appointment-service | 4102 | Doctors, slots, appointments |
| prescription-service | 4103 | Prescriptions, refill requests |
| update-service | 4104 | Health updates, per-patient notifications |

Service-to-service calls: booking and prescribing verify the patient via patient-service; booking also notifies via update-service (best effort, so a failed notification never blocks a booking). If one service is down, the app still loads the others and shows a warning banner.

## Key rules enforced server-side

- Patients see only their own appointments, prescriptions, records and notifications; doctors see their own; admins see all.
- Double booking is rejected (409); slots respect doctor working days and cannot be in the past.
- Prescriptions can only be issued by doctors/admins and are blocked if the medicine matches a recorded allergy.

## API (all via the gateway, `Authorization: Bearer <token>`)

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Login |
| GET | `/api/patients`, `/api/patients/:id` | Patient profile + medical info |
| PATCH | `/api/patients/:id/medical` | Edit blood group / allergies / conditions (staff) |
| POST | `/api/patients/:id/vitals` or `/reports` | Add vitals / lab report (staff) |
| GET | `/api/doctors`, `/api/doctors/:id/slots?date=YYYY-MM-DD` | Doctors and free slots |
| GET/POST | `/api/appointments` | List / book |
| PATCH | `/api/appointments/:id/status` | Cancel (patient) or Cancelled/Completed (staff) |
| GET/POST | `/api/prescriptions` | List / issue (staff) |
| PATCH | `/api/prescriptions/:id/refill` , `/status` | Request refill (patient) / change status (staff) |
| GET/POST | `/api/updates` | Health updates / publish (staff) |
| GET/POST | `/api/notifications`, PATCH `/:id/read` | Alerts |

`docs/database-schema.sql` holds the PostgreSQL design (keys, constraints, partial unique index for slots, view) for the DBMS deliverable. The runnable demo uses JSON files so the "database per service" idea is easy to demonstrate without a DB install.

## Limits (demo only)

Passwords are stored in plain text in seed data, and tokens are a simple HMAC-signed payload. For production use hashed passwords, a real JWT library, and PostgreSQL/MongoDB per service.
