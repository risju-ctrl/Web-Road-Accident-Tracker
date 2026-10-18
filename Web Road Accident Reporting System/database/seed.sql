-- Reference data only. User accounts are created by `npm run seed` (database/seed.js)
-- so passwords are properly hashed and never stored in this file.
INSERT INTO accident_categories (name, description) VALUES
('Vehicle Collision', 'Two or more vehicles involved'),
('Hit and Run', 'Driver flees the scene'),
('Pedestrian Accident', 'Involving pedestrian'),
('Motorcycle Accident', 'Motorcycle-related'),
('Vehicle Rollover', 'A vehicle overturned'),
('Other', 'Other accident types')
ON DUPLICATE KEY UPDATE description = VALUES(description);
