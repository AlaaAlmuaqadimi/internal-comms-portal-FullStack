import { pool } from './src/db/pool.js';
const [rows] = await pool.execute(`SELECT id, parent_id, code, name_ar, name_en, kind, is_active FROM org_units WHERE deleted_at IS NULL AND is_active = 1 ORDER BY sort_order, name_ar`);
const byId = new Map(rows.map(r => [r.id, { ...r, children: [] }]));
const roots = [];
for (const r of byId.values()) { if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).children.push(r); else roots.push(r); }
const print = (n, d) => { console.log('  '.repeat(d) + `[${n.kind}] ${n.name_ar} (${n.code}) id=${n.id}`);
  if (d < 2) for (const c of n.children) print(c, d + 1); };
for (const r of roots) print(r, 0);
const [emp] = await pool.execute(`SELECT COUNT(*) c, SUM(is_active=1) active, SUM(presence='online') online FROM employees WHERE deleted_at IS NULL`);
console.log('EMPLOYEES', emp[0]);
await pool.end();
