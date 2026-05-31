const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'routes');

const files = [
  'announcements.js',
  'auth.js',
  'contactMessages.js',
  'contracts.js',
  'devices.js',
  'feedLogs.js',
  'heroMedia.js',
  'incubators.js',
  'notifications.js',
  'predictions.js',
  'products.js',
  'recommendations.js',
  'sellerApplications.js',
  'sensors.js',
  'teamMembers.js',
  'transactions.js',
  'users.js'
];

function convertToPg(code) {
  // 1. Replace require mysql2 with pg
  code = code.replace(
    /require\(['"]mysql2\/promise['"]\)/g,
    `require('pg')`
  );

  // 2. Replace mysql pool/db creation
  code = code.replace(
    /mysql\.createPool\s*\([^)]*\)/gs,
    `new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })`
  );

  // 3. Replace db.execute with db.query
  code = code.replace(/\bdb\.execute\s*\(/g, 'db.query(');
  code = code.replace(/\bpool\.execute\s*\(/g, 'pool.query(');

  // 4. Convert ? placeholders to $1, $2, $3...
  code = code.replace(
    /(db|pool)\.query\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")\s*,\s*\[/g,
    (match, dbVar, query) => {
      let count = 0;
      const converted = query.replace(/\?/g, () => `$${++count}`);
      return `${dbVar}.query(${converted}, [`;
    }
  );

  // 5. Convert backtick template literal queries with ?
  code = code.replace(/(\$\{[^}]+\})|(\?)/g, (match, interpolation) => {
    if (interpolation) return interpolation;
    return match;
  });

  // 6. Fix LIMIT ? and OFFSET ? in template literals
  code = convertQuestionMarks(code);

  // 7. Replace mysql2 specific: [rows] destructuring still works with pg
  // pg returns { rows } not [rows], fix destructuring
  code = code.replace(
    /const\s+\[(\w+)\]\s*=\s*await\s+(db|pool)\.query\(/g,
    'const { rows: $1 } = await $2.query('
  );
  code = code.replace(
    /const\s+\[(\w+),\s*\w+\]\s*=\s*await\s+(db|pool)\.query\(/g,
    'const { rows: $1 } = await $2.query('
  );
  code = code.replace(
    /const\s+\[(\w+)\]\s*=\s*await\s+(db|pool)\.execute\(/g,
    'const { rows: $1 } = await $2.query('
  );
  code = code.replace(
    /const\s+\[(\w+),\s*\w+\]\s*=\s*await\s+(db|pool)\.execute\(/g,
    'const { rows: $1 } = await $2.query('
  );

  // 8. Fix result.insertId → use RETURNING id
  code = code.replace(
    /result\.insertId/g,
    'result.rows[0]?.id'
  );

  // 9. Fix result.affectedRows → result.rowCount
  code = code.replace(
    /result\.affectedRows/g,
    'result.rowCount'
  );

  // 10. Fix AUTO_INCREMENT in any inline SQL
  code = code.replace(/AUTO_INCREMENT/gi, 'GENERATED ALWAYS AS IDENTITY');

  // 11. Fix backtick table/column names to double quotes
  code = code.replace(/`(\w+)`/g, '"$1"');

  // 12. Remove mysql2 connection pool imports if any
  code = code.replace(
    /const\s+mysql\s*=\s*require\(['"]mysql2\/promise['"]\);\n?/g,
    ''
  );

  return code;
}

function convertQuestionMarks(code) {
  // Find all db.query / pool.query calls and replace ? with $1, $2...
  const queryRegex = /((?:db|pool)\.query\s*\(\s*)([\s\S]*?)(\s*,\s*\[[\s\S]*?\]\s*\))/g;

  return code.replace(queryRegex, (match, before, queryStr, after) => {
    let count = 0;
    const converted = queryStr.replace(/\?/g, () => `$${++count}`);
    return `${before}${converted}${after}`;
  });
}

// Process each file
let successCount = 0;
let errorCount = 0;

for (const file of files) {
  const filePath = path.join(routesDir, file);

  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping ${file} - not found`);
      continue;
    }

    // Backup original file
    const backupPath = filePath + '.mysql.bak';
    fs.copyFileSync(filePath, backupPath);
    console.log(`📦 Backed up ${file} → ${file}.mysql.bak`);

    // Read and convert
    const original = fs.readFileSync(filePath, 'utf8');
    const converted = convertToPg(original);

    // Write converted file
    fs.writeFileSync(filePath, converted, 'utf8');
    console.log(`✅ Converted ${file}`);
    successCount++;

  } catch (err) {
    console.error(`❌ Error converting ${file}:`, err.message);
    errorCount++;
  }
}

console.log(`\n🎉 Done! ${successCount} files converted, ${errorCount} errors`);
console.log(`💡 Original files backed up as *.mysql.bak`);
console.log(`💡 Next steps:`);
console.log(`   1. Update config/db.js to use pg Pool`);
console.log(`   2. Add DATABASE_URL to your .env`);
console.log(`   3. Test each route carefully`);