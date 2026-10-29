const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const env = require('../src/config/env');

async function main() {
  const uri = env.MONGODB_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const backupRoot = path.resolve(env.BACKUP_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRoot, `backup-${stamp}`);
  await fs.mkdir(backupDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  const manifest = { createdAt: new Date().toISOString(), database: db.databaseName, collections: [] };

  for (const col of collections) {
    const name = col.name;
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(backupDir, `${name}.json`);
    // Canonical Extended JSON preserves ObjectId, Date, Decimal128, Long, etc.
    await fs.writeFile(file, EJSON.stringify(docs, null, 2, { relaxed: false }));
    manifest.collections.push({ name, count: docs.length, file: `${name}.json` });
    console.log(`Backed up ${docs.length} docs from ${name}`);
  }

  await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await client.close();
  console.log(`Backup completed: ${backupDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
