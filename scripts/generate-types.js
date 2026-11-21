const http = require('http');
const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, '../packages/database/src/generated.types.ts');
console.log('Fetching generated types from postgres-meta generator...');

const req = http.get('http://127.0.0.1:54321/pg/generators/typescript', (res) => {
  if (res.statusCode !== 200) {
    console.error(`Generator endpoint returned status ${res.statusCode}`);
    process.exit(1);
  }
  const file = fs.createWriteStream(targetPath);
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    const stats = fs.statSync(targetPath);
    console.log(`Successfully generated types to ${targetPath} (${stats.size} bytes)`);
  });
});

req.on('error', (err) => {
  console.error('Failed to connect to generator endpoint:', err.message);
  process.exit(1);
});
