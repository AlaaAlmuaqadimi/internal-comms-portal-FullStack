import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z', // interpret/emit DATETIME values as UTC
  dateStrings: false,
  namedPlaceholders: false,
  multipleStatements: false,
  supportBigNumbers: true,
  bigNumberStrings: false,
  decimalNumbers: false,
});

export function query(sql, params) {
  return pool.execute(sql, params);
}

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export async function closePool() {
  await pool.end();
}
