-- CareConnect: PostgreSQL schema (production target for the JSON demo stores)
-- Each service would own its own database; shown together here for the DBMS deliverable.
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patient','doctor','admin'))
);
CREATE TABLE patients (
  user_id TEXT PRIMARY KEY REFERENCES users(id), phone TEXT, dob DATE, emergency_contact TEXT, blood_group TEXT
);
CREATE TABLE patient_allergies   (patient_id TEXT REFERENCES patients(user_id), allergen TEXT, PRIMARY KEY (patient_id, allergen));
CREATE TABLE patient_conditions  (patient_id TEXT REFERENCES patients(user_id), condition TEXT, PRIMARY KEY (patient_id, condition));
CREATE TABLE vitals (
  id SERIAL PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(user_id), recorded_on DATE NOT NULL,
  bp TEXT, pulse INT, weight_kg NUMERIC(5,1), sugar INT
);
CREATE TABLE lab_reports (
  id SERIAL PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(user_id), reported_on DATE NOT NULL,
  name TEXT NOT NULL, result TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Normal'
);
CREATE TABLE doctors (
  user_id TEXT PRIMARY KEY REFERENCES users(id), specialization TEXT NOT NULL, fee NUMERIC(8,2), working_days INT[], slots TIME[]
);
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(user_id), doctor_id TEXT NOT NULL REFERENCES doctors(user_id),
  appt_date DATE NOT NULL, appt_time TIME NOT NULL, reason TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Cancelled','Completed'))
);
-- Prevents double booking, mirrors the 409 check in appointment-service
CREATE UNIQUE INDEX uq_active_slot ON appointments (doctor_id, appt_date, appt_time) WHERE status = 'Scheduled';
CREATE INDEX idx_appt_patient ON appointments (patient_id, appt_date);
CREATE TABLE prescriptions (
  id SERIAL PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(user_id), doctor_id TEXT NOT NULL REFERENCES doctors(user_id),
  issued_on DATE NOT NULL DEFAULT CURRENT_DATE, diagnosis TEXT NOT NULL, notes TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Completed')), refill_requested BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE prescription_items (
  id SERIAL PRIMARY KEY, prescription_id INT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine TEXT NOT NULL, dosage TEXT NOT NULL, frequency TEXT, days INT
);
CREATE TABLE health_updates (id SERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, category TEXT, published_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(user_id), type TEXT, title TEXT NOT NULL,
  message TEXT NOT NULL, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE VIEW v_active_prescriptions AS
  SELECT p.id, u.name AS patient, d.name AS doctor, p.diagnosis, p.refill_requested
  FROM prescriptions p JOIN users u ON u.id = p.patient_id JOIN users d ON d.id = p.doctor_id WHERE p.status = 'Active';
