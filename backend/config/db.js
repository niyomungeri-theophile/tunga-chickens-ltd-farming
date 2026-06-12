const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const usePostgres = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
let pool;

function normalizeSqlForPostgres(sql) {
  if (!sql || typeof sql !== 'string') return sql;

  let normalized = sql;

  // Support MySQL-style NOT REGEXP and REGEXP
  normalized = normalized.replace(/\bNOT\s+REGEXP\b/gi, '!~');
  normalized = normalized.replace(/\bREGEXP\b/gi, '~');

  // Replace MySQL UUID() usage with Postgres gen_random_uuid()
  normalized = normalized.replace(/UUID\(\)/gi, 'gen_random_uuid()');

  // Convert AUTO_INCREMENT to identity columns
  normalized = normalized.replace(/AUTO_INCREMENT/gi, 'GENERATED ALWAYS AS IDENTITY');

  // Convert MySQL CAST(... AS UNSIGNED) to Postgres integer cast
  normalized = normalized.replace(/CAST\s*\(\s*([^()]+?)\s+AS\s+UNSIGNED\s*\)/gi, 'CAST($1 AS INTEGER)');
  normalized = normalized.replace(/\bAS\s+UNSIGNED\b/gi, 'AS INTEGER');

  // Convert nested SUBSTRING_INDEX calls into split_part for Postgres
  normalized = normalized.replace(/SUBSTRING_INDEX\s*\(\s*SUBSTRING_INDEX\s*\(\s*([^,]+?)\s*,\s*['"]-['"]\s*,\s*2\s*\)\s*,\s*['"]-['"]\s*,\s*-1\s*\)/gi, 'split_part($1, \'-\', 2)');

  // Remove engine/charset clauses
  normalized = normalized.replace(/ENGINE\s*=\s*\w+\s*(DEFAULT CHARSET=[^;\n]+)?/gi, '');
  normalized = normalized.replace(/DEFAULT CHARSET=[^;\n]+/gi, '');

  // Convert tinyint types to smallint for Postgres compatibility
  normalized = normalized.replace(/\bTINYINT\s*\(1\)/gi, 'SMALLINT');
  normalized = normalized.replace(/\bTINYINT\b/gi, 'SMALLINT');

  // Convert ENUM types to TEXT (Postgres can use TEXT instead)
  normalized = normalized.replace(/ENUM\([^)]*\)/gi, 'TEXT');

  // Convert IFNULL to COALESCE for Postgres compatibility
  normalized = normalized.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');

  // Remove MySQL-only ON UPDATE CURRENT_TIMESTAMP
  normalized = normalized.replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '');

  // Convert DATE_ADD and DATE_SUB to Postgres interval arithmetic
  normalized = normalized.replace(/DATE_ADD\s*\(\s*([^,]+?)\s*,\s*INTERVAL\s*([0-9]+)\s+DAY\s*\)/gi, `($1 + INTERVAL '$2 days')`);
  normalized = normalized.replace(/DATE_SUB\s*\(\s*([^,]+?)\s*,\s*INTERVAL\s*([0-9]+)\s+DAY\s*\)/gi, `($1 - INTERVAL '$2 days')`);
  normalized = normalized.replace(/DATE_ADD\s*\(\s*([^,]+?)\s*,\s*INTERVAL\s*([0-9]+)\s+HOUR\s*\)/gi, `($1 + INTERVAL '$2 hours')`);
  normalized = normalized.replace(/DATE_SUB\s*\(\s*([^,]+?)\s*,\s*INTERVAL\s*([0-9]+)\s+HOUR\s*\)/gi, `($1 - INTERVAL '$2 hours')`);

  // Convert MySQL interval syntax used directly after a timestamp expression
  normalized = normalized.replace(/(\bNOW\(\)|\bCURRENT_TIMESTAMP\b)\s*([-+])\s*INTERVAL\s*([0-9]+)\s+DAY/gi, `($1 $2 INTERVAL '$3 days')`);
  normalized = normalized.replace(/(\bNOW\(\)|\bCURRENT_TIMESTAMP\b)\s*([-+])\s*INTERVAL\s*([0-9]+)\s+HOUR/gi, `($1 $2 INTERVAL '$3 hours')`);

  // Normalize MySQL ALTER TABLE MODIFY default timestamp semantics to Postgres
  normalized = normalized.replace(/ALTER\s+TABLE\s+["']?([\w.]+)["']?\s+MODIFY\s+COLUMN\s+["']?([\w]+)["']?\s+[^;]+?DEFAULT\s+CURRENT_TIMESTAMP(?:\s+AFTER\s+["']?[\w]+["']?)?/gi, 'ALTER TABLE "$1" ALTER COLUMN "$2" SET DEFAULT CURRENT_TIMESTAMP');
  normalized = normalized.replace(/ALTER\s+TABLE\s+["']?([\w.]+)["']?\s+MODIFY\s+["']?([\w]+)["']?\s+[^;]+?DEFAULT\s+CURRENT_TIMESTAMP(?:\s+AFTER\s+["']?[\w]+["']?)?/gi, 'ALTER TABLE "$1" ALTER COLUMN "$2" SET DEFAULT CURRENT_TIMESTAMP');
  normalized = normalized.replace(/\bMODIFY\s+COLUMN\b/gi, 'ALTER COLUMN');
  normalized = normalized.replace(/\bMODIFY\b/gi, 'ALTER COLUMN');
  normalized = normalized.replace(/\bAFTER\s+["']?[\w]+["']?/gi, '');
  normalized = normalized.replace(/\bCURDATE\(\)\b/gi, 'CURRENT_DATE');

  // Convert backticks to double quotes
  normalized = normalized.replace(/`([^`]+)`/g, '"$1"');

  return normalized;
}

function extractInlineIndexes(sql) {
  const indexes = [];
  const tableNameMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([\w.]+)"?/i);
  const tableName = tableNameMatch ? tableNameMatch[1] : null;

  let cleanedSql = sql.replace(/^\s*,?\s*(UNIQUE\s+)?\b(?:KEY|INDEX)\b\s+"?(\w+)"?\s*\(([^)]+)\)\s*,?\s*$/gmi, (match, unique, indexName, columns) => {
    if (!tableName) return '';
    const uniqueClause = unique ? 'UNIQUE ' : '';
    const cols = columns.replace(/`/g, '"').trim();
    indexes.push(`CREATE ${uniqueClause}INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" (${cols});`);
    return '';
  });

  cleanedSql = cleanedSql.replace(/,\s*(\r?\n\s*\))/g, '$1');

  return { cleanedSql, indexStatements: indexes };
}

function convertPositionalParameters(sql, params) {
  if (!params || params.length === 0) return { sql, params: [] };
  let index = 0;
  const convertedSql = sql.replace(/\?/g, () => `$${++index}`);
  return { sql: convertedSql, params };
}

function mapPostgresError(error) {
  if (!error || typeof error !== 'object') return error;
  const originalCode = error.code;
  const postgresCodeMap = {
    '23505': 'ER_DUP_ENTRY',
    '23503': 'ER_NO_REFERENCED_ROW_2',
    '42701': 'ER_DUP_FIELDNAME',
    // 42P07 is duplicate_table/relation exists — treat as duplicate key/index to match MySQL checks
    '42P07': 'ER_DUP_KEYNAME',
    '42710': 'ER_DUP_KEYNAME',
    '42P01': 'ER_NO_SUCH_TABLE',
    '42703': 'ER_BAD_FIELD_ERROR'
  };

  if (postgresCodeMap[originalCode]) {
    error.code = postgresCodeMap[originalCode];
  }

  return error;
}

function mapPostgresResult(result) {
  if (!result) return result;
  return {
    ...result,
    affectedRows: result.rowCount,
    insertId: result.rows?.[0]?.id ?? result.rows?.[0]?.uuid ?? undefined
  };
}

function prepareQuery(sql, params) {
  const normalized = normalizeSqlForPostgres(sql);
  const { cleanedSql, indexStatements } = extractInlineIndexes(normalized);
  const converted = convertPositionalParameters(cleanedSql, params);
  return { ...converted, indexStatements };
}

function isSelectOrShow(sql) {
  return /^\s*(SELECT|SHOW|DESCRIBE|WITH|EXPLAIN)\b/i.test(sql.trim());
}

function createPostgresPool() {
  const { Pool } = require('pg');
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  (async () => {
    try {
      await pgPool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    } catch (err) {
      console.warn('Could not create pgcrypto extension:', err.message || err);
    }
  })();

  function ensureReturningOnInsert(sql) {
    const trimmed = sql.trim();
    if (!/^INSERT\s+INTO\s+/i.test(trimmed)) return sql;
    if (/\bRETURNING\b/i.test(trimmed)) return sql;
    return `${sql.trim()} RETURNING id`;
  }

  async function executeQuery(sql, params) {
    const { sql: convertedSql, params: convertedParams, indexStatements } = prepareQuery(sql, params);
    const sqlWithReturning = ensureReturningOnInsert(convertedSql);
    try {
      const result = await pgPool.query(sqlWithReturning, convertedParams);
      for (const idx of indexStatements) {
        await pgPool.query(idx);
      }
      if (isSelectOrShow(convertedSql)) {
        return [result.rows, result.fields];
      }
      return [mapPostgresResult(result), result.fields];
    } catch (err) {
      throw mapPostgresError(err);
    }
  }

  async function getConnection() {
    const client = await pgPool.connect();
    return {
      query: async (sql, params) => {
        const { sql: convertedSql, params: convertedParams, indexStatements } = prepareQuery(sql, params);
        const sqlWithReturning = ensureReturningOnInsert(convertedSql);
        try {
          const result = await client.query(sqlWithReturning, convertedParams);
          for (const idx of indexStatements) {
            await client.query(idx);
          }
          if (isSelectOrShow(convertedSql)) {
            return [result.rows, result.fields];
          }
          return [mapPostgresResult(result), result.fields];
        } catch (err) {
          throw mapPostgresError(err);
        }
      },
      execute: async (sql, params) => {
        const { sql: convertedSql, params: convertedParams, indexStatements } = prepareQuery(sql, params);
        const sqlWithReturning = ensureReturningOnInsert(convertedSql);
        try {
          const result = await client.query(sqlWithReturning, convertedParams);
          for (const idx of indexStatements) {
            await client.query(idx);
          }
          if (isSelectOrShow(convertedSql)) {
            return [result.rows, result.fields];
          }
          return [mapPostgresResult(result), result.fields];
        } catch (err) {
          throw mapPostgresError(err);
        }
      },
      beginTransaction: async () => client.query('BEGIN'),
      commit: async () => client.query('COMMIT'),
      rollback: async () => client.query('ROLLBACK'),
      release: () => client.release()
    };
  }

  return {
    query: executeQuery,
    execute: executeQuery,
    getConnection
  };
}

function createMysqlPool() {
  const mysql = require('mysql2/promise');
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'eco_smart_poultry',
    port: Number(process.env.DB_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
  });
}

pool = usePostgres ? createPostgresPool() : createMysqlPool();
pool.isPostgres = usePostgres;
pool.normalizeSqlForPostgres = normalizeSqlForPostgres;

const testConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query('SELECT 1');
    console.log(usePostgres ? '✅ PostgreSQL database connected successfully' : '✅ MySQL database connected successfully');
  } catch (error) {
    console.error(usePostgres ? '❌ PostgreSQL connection error:' : '❌ MySQL connection error:', error.message);
  } finally {
    if (connection && typeof connection.release === 'function') await connection.release();
  }
};

testConnection();

module.exports = pool;
