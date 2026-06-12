const allowedTableOrderColumns = {
  sensors: 'recorded_at',
  gas_readings: 'recorded_at',
  power_readings: 'reading_time',
  sensor_data: 'created_at'
};

async function pruneTableToLatestRows(pool, tableName, maxRows = 500) {
  const orderColumn = allowedTableOrderColumns[tableName];
  if (!orderColumn) {
    throw new Error(`Unsupported prune table: ${tableName}`);
  }

  const [countRows] = await pool.query(`SELECT COUNT(*) AS count FROM \`${tableName}\``);
  const totalRows = Number(countRows?.[0]?.count || 0);
  if (totalRows <= maxRows) {
    return;
  }

  await pool.query(
    `DELETE FROM \`${tableName}\`
     WHERE id NOT IN (
       SELECT id FROM (
         SELECT id FROM \`${tableName}\`
         ORDER BY \`${orderColumn}\` DESC, id DESC
         LIMIT ?
       ) AS keep_rows
     )`,
    [maxRows]
  );
}

module.exports = {
  pruneTableToLatestRows
};
