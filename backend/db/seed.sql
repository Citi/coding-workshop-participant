-- =====================================================================
-- ACME Facility Incident Management - sample data
--
-- Run after schema.sql:
--   psql -h <host> -U <user> -d <db> -f backend/db/seed.sql
--
-- WARNING: wipes all existing rows in these tables before inserting.
--
-- Every account's password is:  Password123!
-- (stored as a bcrypt hash, cost 10)
-- =====================================================================

BEGIN;

TRUNCATE incident_history, incident_notes, incidents, engineer_profiles,
         seats, floors, buildings, users
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
INSERT INTO users (full_name, email, password_hash, role, department, phone) VALUES
    ('Alice Admin',      'alice.admin@acme.inc',     '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'facility_admin', 'Facilities',  '+1-555-0100'),
    ('Ethan Electrics',  'ethan.eng@acme.inc',       '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'engineer',       'Facilities',  '+1-555-0110'),
    ('Priya Plumbing',   'priya.eng@acme.inc',       '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'engineer',       'Facilities',  '+1-555-0111'),
    ('Tom Tech',         'tom.eng@acme.inc',         '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'engineer',       'Workplace IT','+1-555-0112'),
    ('Omar Hassan',      'omar.eng@acme.inc',        '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'engineer',       'Facilities',  '+1-555-0113'),
    ('Emma Employee',    'emma@acme.inc',            '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'employee',       'Finance',     NULL),
    ('Liam Lee',         'liam.lee@acme.inc',        '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'employee',       'Marketing',   NULL),
    ('Sofia Santos',     'sofia.santos@acme.inc',    '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'employee',       'Engineering', NULL),
    ('Noah Patel',       'noah.patel@acme.inc',      '$2b$10$QSJnNWOu7OnfDPDA8gYPCOFOIv5cs4RelbH2TwIzWNSY7i9ceL0B.', 'employee',       'HR',          NULL);

-- ---------------------------------------------------------------------
-- Buildings, floors, seats
-- ---------------------------------------------------------------------
INSERT INTO buildings (code, name, address, city, country, created_by)
SELECT b.code, b.name, b.address, b.city, b.country, u.id
FROM (VALUES
    ('HQ1', 'ACME Headquarters', '1 Acme Plaza',       'Springfield', 'USA'),
    ('INN', 'ACME Innovation Hub', '200 Research Way', 'Springfield', 'USA')
) AS b(code, name, address, city, country)
CROSS JOIN users u WHERE u.email = 'alice.admin@acme.inc';

INSERT INTO floors (building_id, floor_number, name)
SELECT b.id, f.num, f.name
FROM (VALUES
    ('HQ1', 0, 'Ground Floor - Reception'),
    ('HQ1', 1, 'First Floor - Finance & HR'),
    ('HQ1', 2, 'Second Floor - Marketing'),
    ('INN', 0, 'Ground Floor - Labs'),
    ('INN', 1, 'First Floor - Engineering')
) AS f(code, num, name)
JOIN buildings b ON b.code = f.code;

INSERT INTO seats (floor_id, seat_code, description)
SELECT fl.id, s.seat_code, s.descr
FROM (VALUES
    ('HQ1', 0, 'G-REC-01', 'Reception desk'),
    ('HQ1', 1, '1A-001',   'Finance pod, window'),
    ('HQ1', 1, '1A-002',   'Finance pod, aisle'),
    ('HQ1', 1, '1B-010',   'HR pod'),
    ('HQ1', 2, '2A-015',   'Marketing open area'),
    ('HQ1', 2, '2A-016',   'Marketing open area'),
    ('INN', 0, 'LAB-01',   'Hardware lab bench'),
    ('INN', 1, '1E-020',   'Engineering pod near kitchen'),
    ('INN', 1, '1E-021',   'Engineering pod near kitchen')
) AS s(code, num, seat_code, descr)
JOIN buildings b ON b.code = s.code
JOIN floors fl ON fl.building_id = b.id AND fl.floor_number = s.num;

-- ---------------------------------------------------------------------
-- Engineer profiles
-- ---------------------------------------------------------------------
INSERT INTO engineer_profiles (user_id, specializations, availability, max_active_tickets, home_building_id, created_by)
SELECT u.id, e.specs::incident_category[], e.avail::engineer_availability, e.max_t, b.id, a.id
FROM (VALUES
    ('ethan.eng@acme.inc', '{electrical,hvac}',                  'available', 5, 'HQ1'),
    ('priya.eng@acme.inc', '{plumbing,cleaning,furniture}',      'busy',      4, 'HQ1'),
    ('tom.eng@acme.inc',   '{it_hardware,network,audio_visual}', 'available', 6, 'INN'),
    ('omar.eng@acme.inc',  '{security,cleaning}',                'on_leave',  5, 'INN')
) AS e(email, specs, avail, max_t, bcode)
JOIN users u ON u.email = e.email
JOIN buildings b ON b.code = e.bcode
CROSS JOIN users a WHERE a.email = 'alice.admin@acme.inc';

-- ---------------------------------------------------------------------
-- Incidents (created as 'open'; lifecycle changes applied below so the
-- history trigger records them like the real app would)
-- ---------------------------------------------------------------------
INSERT INTO incidents (title, description, category, priority, reported_by,
                       building_id, floor_id, seat_id, location_details, created_at)
SELECT i.title, i.descr, i.cat::incident_category, i.prio::incident_priority, u.id,
       b.id, fl.id, st.id, i.loc, now() - i.age
FROM (VALUES
    ('Air conditioning not cooling', 'The AC in the finance pod has been blowing warm air since this morning.',
        'hvac', 'medium', 'emma@acme.inc', 'HQ1', 1, '1A-001', NULL, interval '3 days'),
    ('Leaking tap in kitchen', 'Kitchen tap on the second floor drips constantly and the sink is filling.',
        'plumbing', 'low', 'liam.lee@acme.inc', 'HQ1', 2, NULL, 'Second floor kitchen', interval '2 days'),
    ('Docking station not detecting monitors', 'Neither external monitor works when I dock my laptop.',
        'it_hardware', 'medium', 'sofia.santos@acme.inc', 'INN', 1, '1E-020', NULL, interval '1 day'),
    ('Flickering lights in HR pod', 'Ceiling lights above the HR pod flicker every few seconds.',
        'electrical', 'low', 'noah.patel@acme.inc', 'HQ1', 1, '1B-010', NULL, interval '6 days'),
    ('Wi-Fi drops in hardware lab', 'Wi-Fi disconnects every 10 minutes, blocking firmware uploads.',
        'network', 'high', 'sofia.santos@acme.inc', 'INN', 0, 'LAB-01', NULL, interval '5 hours'),
    ('Broken chair', 'Chair at my desk will not stay at height.',
        'furniture', 'low', 'emma@acme.inc', 'HQ1', 1, '1A-002', NULL, interval '8 days'),
    ('Reception door badge reader offline', 'Badge reader at the main entrance does not respond.',
        'security', 'medium', 'noah.patel@acme.inc', 'HQ1', 0, 'G-REC-01', 'Main entrance', interval '4 days')
) AS i(title, descr, cat, prio, email, bcode, fnum, seat, loc, age)
JOIN users u ON u.email = i.email
JOIN buildings b ON b.code = i.bcode
JOIN floors fl ON fl.building_id = b.id AND fl.floor_number = i.fnum
LEFT JOIN seats st ON st.floor_id = fl.id AND st.seat_code = i.seat
ORDER BY i.age DESC;  -- oldest incident gets INC-000001

-- Admin assigns tickets  (app.user_id = acting user for the history log)
DO $$ BEGIN PERFORM set_config('app.user_id', (SELECT id::text FROM users WHERE email = 'alice.admin@acme.inc'), TRUE); END $$;

UPDATE incidents i SET status = 'assigned', assigned_at = now(),
       assigned_engineer_id = e.id, assigned_by = a.id
FROM (VALUES
    ('Air conditioning not cooling',            'ethan.eng@acme.inc'),
    ('Leaking tap in kitchen',                  'priya.eng@acme.inc'),
    ('Docking station not detecting monitors',  'tom.eng@acme.inc'),
    ('Flickering lights in HR pod',             'ethan.eng@acme.inc'),
    ('Broken chair',                            'priya.eng@acme.inc')
) AS m(title, email)
JOIN users e ON e.email = m.email
CROSS JOIN users a
WHERE a.email = 'alice.admin@acme.inc' AND i.title = m.title;

-- Engineers progress their tickets
DO $$ BEGIN PERFORM set_config('app.user_id', (SELECT id::text FROM users WHERE email = 'ethan.eng@acme.inc'), TRUE); END $$;
UPDATE incidents SET status = 'in_progress' WHERE title = 'Air conditioning not cooling';
UPDATE incidents SET status = 'in_progress' WHERE title = 'Flickering lights in HR pod';
UPDATE incidents SET status = 'resolved', resolved_at = now() - interval '1 day'
 WHERE title = 'Flickering lights in HR pod';

DO $$ BEGIN PERFORM set_config('app.user_id', (SELECT id::text FROM users WHERE email = 'priya.eng@acme.inc'), TRUE); END $$;
UPDATE incidents SET status = 'on_hold' WHERE title = 'Leaking tap in kitchen';
UPDATE incidents SET status = 'in_progress' WHERE title = 'Broken chair';
UPDATE incidents SET status = 'resolved', resolved_at = now() - interval '3 days' WHERE title = 'Broken chair';

-- Admin closes the resolved chair ticket
DO $$ BEGIN PERFORM set_config('app.user_id', (SELECT id::text FROM users WHERE email = 'alice.admin@acme.inc'), TRUE); END $$;
UPDATE incidents SET status = 'closed', closed_at = now() - interval '2 days' WHERE title = 'Broken chair';
-- ...and raises the leaking tap's priority (sink is overflowing)
UPDATE incidents SET priority = 'medium' WHERE title = 'Leaking tap in kitchen';

-- Employee cancels a duplicate report before it was assigned
DO $$ BEGIN PERFORM set_config('app.user_id', (SELECT id::text FROM users WHERE email = 'noah.patel@acme.inc'), TRUE); END $$;
UPDATE incidents SET status = 'cancelled' WHERE title = 'Reception door badge reader offline';

-- Employee requests higher priority and escalates the unassigned Wi-Fi ticket
DO $$ BEGIN PERFORM set_config('app.user_id', (SELECT id::text FROM users WHERE email = 'sofia.santos@acme.inc'), TRUE); END $$;
UPDATE incidents SET requested_priority = 'critical', is_escalated = TRUE, escalated_at = now(),
       escalation_reason = 'Release deadline tomorrow; lab firmware uploads are blocked.'
 WHERE title = 'Wi-Fi drops in hardware lab';

-- ---------------------------------------------------------------------
-- Incident notes
-- ---------------------------------------------------------------------
INSERT INTO incident_notes (incident_id, author_id, body, is_internal, created_at)
SELECT i.id, u.id, n.body, n.internal, now() - n.age
FROM (VALUES
    ('Air conditioning not cooling', 'ethan.eng@acme.inc',  'Checked the unit - refrigerant is low. Recharge scheduled for tomorrow 9am.', FALSE, interval '2 days'),
    ('Air conditioning not cooling', 'emma@acme.inc',       'Thanks! Could we get a desk fan in the meantime?',                         FALSE, interval '47 hours'),
    ('Air conditioning not cooling', 'ethan.eng@acme.inc',  'Fan dropped off at your desk.',                                           FALSE, interval '46 hours'),
    ('Leaking tap in kitchen',       'priya.eng@acme.inc',  'Replacement cartridge ordered, ETA 2 business days.',                     FALSE, interval '1 day'),
    ('Leaking tap in kitchen',       'priya.eng@acme.inc',  'Supplier PO #4471 - chase if not delivered by Friday.',                   TRUE,  interval '1 day'),
    ('Docking station not detecting monitors', 'sofia.santos@acme.inc', 'Model is a Dell WD19, laptop is a Latitude 7440.',            FALSE, interval '20 hours'),
    ('Flickering lights in HR pod',  'ethan.eng@acme.inc',  'Replaced the faulty ballast. Please let us know if it comes back.',       FALSE, interval '1 day'),
    ('Broken chair',                 'priya.eng@acme.inc',  'Swapped the gas lift; chair holds height now.',                          FALSE, interval '3 days'),
    ('Broken chair',                 'emma@acme.inc',       'Confirmed, all good - thank you!',                                        FALSE, interval '2 days'),
    ('Reception door badge reader offline', 'noah.patel@acme.inc', 'Duplicate - security team already fixed it. Cancelling.',              FALSE, interval '4 days')
) AS n(title, email, body, internal, age)
JOIN incidents i ON i.title = n.title
JOIN users u ON u.email = n.email;

COMMIT;
