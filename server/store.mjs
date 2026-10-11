import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function openStore(directory, providedKey) {
  mkdirSync(directory, { recursive: true });
  const keyPath = join(directory, 'encryption-key');
  if (providedKey && !/^[a-f\d]{64}$/i.test(providedKey))
    throw new Error('MUMU_ENCRYPTION_KEY 必须为 64 位十六进制');
  if (!providedKey && !existsSync(keyPath))
    writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
  const key = Buffer.from(providedKey || readFileSync(keyPath, 'utf8').trim(), 'hex');
  const db = new DatabaseSync(join(directory, 'mumu.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, payload TEXT NOT NULL, result TEXT, error TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);`);
  const encrypt = (data) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const dataBuffer = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${dataBuffer.toString('base64')}`;
  };
  const decrypt = (value) => {
    const [iv, tag, ciphertext] = value.split(':');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString(),
    );
  };
  const job = (row) =>
    row
      ? {
          ...row,
          payload: decrypt(row.payload),
          result: row.result ? JSON.parse(row.result) : null,
        }
      : null;
  return {
    db,
    settings() {
      const row = db.prepare('SELECT value FROM settings WHERE id=1').get();
      return row ? decrypt(row.value) : null;
    },
    saveSettings(value) {
      db.prepare(
        'INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
      ).run(encrypt(value));
    },
    getJob(id) {
      return job(db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
    },
    addJob(id, payload) {
      const now = Date.now();
      db.prepare('INSERT INTO jobs(id,status,payload,created,updated) VALUES(?,?,?,?,?)').run(
        id,
        'queued',
        encrypt(payload),
        now,
        now,
      );
      return this.getJob(id);
    },
    nextJob() {
      return job(
        db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1").get(),
      );
    },
    updateJob(id, status, result = null, error = null) {
      db.prepare('UPDATE jobs SET status=?,result=?,error=?,updated=? WHERE id=?').run(
        status,
        result ? JSON.stringify(result) : null,
        error,
        Date.now(),
        id,
      );
    },
    claim(id) {
      db.prepare(
        "UPDATE jobs SET status='running', attempts=attempts+1,updated=? WHERE id=? AND status='queued'",
      ).run(Date.now(), id);
    },
    recover() {
      db.prepare(
        "UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error=CASE WHEN attempts>=3 THEN '后台多次中断，请手动重试' ELSE NULL END,updated=? WHERE status='running'",
      ).run(Date.now());
    },
    queueSize() {
      return db
        .prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('queued','running')")
        .get().count;
    },
    prune() {
      db.prepare(
        "DELETE FROM jobs WHERE status IN ('done','failed','cancelled') AND updated<?",
      ).run(Date.now() - 30 * 86400000);
    },
    close() {
      db.close();
    },
  };
}
