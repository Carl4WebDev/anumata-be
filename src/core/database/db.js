import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

let pool;

const poolConfig = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

if (process.env.DATABASE_URL) {
  pool = new Pool({
    ...poolConfig,
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
} else {
  pool = new Pool({
    ...poolConfig,
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
  });
}

class Database {
  constructor() {
    if (!Database.instance) {
      this.pool = pool;
      Database.instance = this;
    }

    return Database.instance;
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async getClient() {
    return await this.pool.connect();
  }

  async transaction(work) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async end() {
    await this.pool.end();
  }
}

const db = new Database();
Object.freeze(db);

export default db;
