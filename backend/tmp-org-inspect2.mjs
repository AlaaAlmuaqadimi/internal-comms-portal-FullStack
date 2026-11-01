import { pool } from './src/db/pool.js';
const [kinds] = await pool.execute(`SELECT ou.kind, COUNT(*) c FROM employees e JOIN org_units ou ON ou.id=e.org_unit_id WHERE e.deleted_at IS NULL GROUP BY ou.kind`);
console.log('employees by org kind', kinds);
const [secByDir] = await pool.execute(`SELECT p.name_ar dept, COUNT(c.id) sections FROM org_units p JOIN org_units c ON c.parent_id=p.id AND c.kind='section' WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY sections DESC LIMIT 8`);
console.log('sections per department (top)', secByDir);
const [depths] = await pool.execute(`SELECT kind, COUNT(*) c FROM org_units WHERE deleted_at IS NULL AND is_active=1 GROUP BY kind`);
console.log('org kinds', depths);
await pool.end();
