-- One-time normalization before `employees.division` becomes an ENUM.
--
-- Existing databases stored division as free text (and left it NULL when the
-- field was optional). Run this once against such a database, before the new
-- backend boots with `DB_SYNCHRONIZE`, otherwise MySQL refuses the ALTER that
-- tightens the column to `enum('Sales','Human Resources','Engineering',
-- 'Finance','Operations')`:
--
--   mysql -h "$DB_HOST" -u "$DB_USERNAME" -p "$DB_DATABASE" \
--     < backend/scripts/normalize-divisions.sql
--
-- The mapping mirrors `src/employee/divisions.ts`.

UPDATE employees SET division = 'Human Resources'
  WHERE division IN ('People Operations', 'People Ops', 'People', 'HR', 'Human Resource');

UPDATE employees SET division = 'Sales'
  WHERE division IN ('Marketing', 'Growth');

UPDATE employees SET division = 'Engineering'
  WHERE division IN ('Design', 'Product', 'IT', 'Technology', 'Tech');

UPDATE employees SET division = 'Finance'
  WHERE division IN ('Accounting');

UPDATE employees SET division = 'Operations'
  WHERE division IN ('Ops', 'Business Operations');

-- Anything left (NULL, empty, unknown) becomes the catch-all.
UPDATE employees SET division = 'Operations'
  WHERE division IS NULL
     OR division NOT IN ('Sales', 'Human Resources', 'Engineering', 'Finance', 'Operations');
