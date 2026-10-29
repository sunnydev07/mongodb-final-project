# Backup and Restore Strategy

## 1. Goals

A backup plan is defined by two targets:

- **RPO (Recovery Point Objective)** — how much data may be lost. For this project, a daily backup gives an RPO of up to 24 hours; production may need oplog-based point-in-time recovery for minutes/seconds.
- **RTO (Recovery Time Objective)** — how long restoration may take. A small logical restore takes seconds; a large production restore may take hours and must be rehearsed.

The project implements a portable logical backup/restore tool and documents how to move to production-grade tooling.

## 2. What is backed up

`scripts/backup.js` connects with `MONGODB_URI`, lists every collection in the database, and writes one file per collection plus a manifest:

```text
backups/backup-2026-10-29T08-12-39-573Z/
├── manifest.json
├── users.json
├── products.json
├── orders.json
└── reviews.json
```

`manifest.json`:

```json
{
  "createdAt": "2026-10-29T08:12:39.580Z",
  "database": "mongo_final_project",
  "collections": [
    { "name": "users", "count": 41, "file": "users.json" },
    { "name": "products", "count": 500, "file": "products.json" },
    { "name": "orders", "count": 60, "file": "orders.json" },
    { "name": "reviews", "count": 158, "file": "reviews.json" }
  ]
}
```

Indexes are **not** stored in the files. They are defined in the Mongoose schemas and recreated by `npm run indexes` (or by `autoIndex` outside production). A restore into a fresh database must be followed by an index sync.

## 3. Format: canonical Extended JSON

MongoDB documents contain BSON types that plain JSON cannot represent: `ObjectId`, `Date`, `Decimal128`, `Long`, binary, and so on. Writing documents with `JSON.stringify` would turn ObjectIds and dates into strings and break references after a restore.

The scripts use **canonical Extended JSON (EJSON)** from the `bson` package:

```json
{
  "_id": { "$oid": "6ae2ffc93e49e3488caf977c" },
  "orderDate": { "$date": { "$numberLong": "1767177600000" } },
  "totalAmount": { "$numberDouble": "27170.0" }
}
```

This preserves types across backup and restore. The `.json` extension is kept for readability, but the content is canonical EJSON.

## 4. Backup script

```bash
npm run backup
# or
node scripts/backup.js
```

Flow:

1. Connect to `MONGODB_URI`.
2. Create `BACKUP_DIR/backup-<ISO timestamp>`.
3. For each collection: `find({})`, serialize with `EJSON.stringify(..., { relaxed: false })`, write `<collection>.json`.
4. Write `manifest.json` with counts and filenames.
5. Close the connection.

Observed output:

```text
Backed up 500 docs from products
Backed up 41 docs from users
Backed up 60 docs from orders
Backed up 158 docs from reviews
Backup completed: ...\backups\backup-2026-10-29T08-12-39-573Z
```

## 5. Restore script

```bash
npm run restore
# restore a specific directory
npm run restore -- ./backups/backup-2026-10-29T08-12-39-573Z
```

With no argument, the script selects the newest `backup-*` directory by name. It then:

1. reads `manifest.json`;
2. for each collection, parses canonical EJSON;
3. **deletes all existing documents** in that collection;
4. inserts the backup documents with `ordered: false`.

Observed output:

```text
Restored 500 docs into products
Restored 41 docs into users
Restored 60 docs into orders
Restored 158 docs into reviews
Restore completed from ...\backups\backup-2026-10-29T08-12-39-573Z
```

### Type verification after restore

```js
const u = db.users.findOne();
const o = db.orders.findOne();
const r = db.reviews.findOne();

({
  userIdIsObjectId: u._id instanceof ObjectId,
  orderCustomerIsObjectId: o.customer instanceof ObjectId,
  reviewProductIsObjectId: r.product instanceof ObjectId,
  orderDateIsDate: o.orderDate instanceof Date
});
```

Observed:

```json
{
  "userIdIsObjectId": true,
  "orderCustomerIsObjectId": true,
  "reviewProductIsObjectId": true,
  "orderDateIsDate": true
}
```

This check matters: it proves the restore did not silently convert references into strings.

### Restore is destructive

The restore deletes each collection before inserting. It is intended for local drills and recovery into a known database. **Do not run it against production without a tested maintenance procedure and a fresh backup.** For selective recovery, restore into a temporary database and copy the required documents.

### After restoring into a fresh deployment

```bash
npm run indexes
```

Indexes are schema-defined and are not part of the backup payload.

## 6. Production-grade options

The JSON tool is deliberately simple and dependency-free. For production, use one or more of the following.

### `mongodump` / `mongorestore`

```bash
# Consistent logical backup with oplog for point-in-time replay
mongodump \
  --uri="mongodb://user:pass@host:27017/mongo_final_project?authSource=admin" \
  --oplog \
  --gzip \
  --archive=/backups/mongo-$(date +%F).archive.gz

# Restore and replay the captured oplog
mongorestore \
  --uri="mongodb://user:pass@host:27017/mongo_final_project?authSource=admin" \
  --oplogReplay \
  --gzip \
  --archive=/backups/mongo-2026-10-29.archive.gz
```

`--oplog` captures writes during the dump so the backup is consistent at a point in time. Without it, a busy database can produce a backup that mixes states from different moments.

### Filesystem / volume snapshots

For self-managed MongoDB, a filesystem or block-storage snapshot of the data directory (with journaling) can be fast and space-efficient. Ensure the snapshot is crash-consistent or taken from a stopped/secondary node according to MongoDB's documented procedure.

### Point-in-time recovery (PITR)

MongoDB Atlas and Ops Manager/Cloud Manager provide continuous backups with oplog-based PITR. Self-managed deployments can combine a base `mongodump` with oplog replay, but this is operationally heavier.

### Backups from a secondary

On a replica set, run `mongodump` against a secondary (or a hidden/delayed member) to avoid loading the primary:

```bash
mongodump --uri="mongodb://secondary-host:27017/mongo_final_project" --oplog --gzip --archive=...
```

## 7. Schedule and retention

A practical 3-2-1 policy:

- **3** copies of data (production + two backups);
- **2** different storage media/platforms;
- **1** offsite/immutable copy.

Example schedule:

| Frequency | Retention | Purpose |
| --- | --- | --- |
| Hourly oplog/PITR (Atlas) or 6-hourly dump | 48 hours | Operational recovery |
| Daily full backup | 30 days | Accidental deletion, corruption |
| Weekly full backup | 12 weeks | Longer investigation window |
| Monthly archive | 12 months | Compliance/audit |

### Windows Task Scheduler example

```powershell
$action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" `
  -Argument "scripts/backup.js" `
  -WorkingDirectory "C:\path\to\mongodb-final-project"
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
Register-ScheduledTask -TaskName "MongoFinalBackup" -Action $action -Trigger $trigger
```

### Linux cron example

```cron
0 */6 * * * cd /opt/mongodb-final-project && /usr/bin/npm run backup >> /var/log/mongo-backup.log 2>&1
```

Pair the schedule with a retention job that deletes old backup directories, and monitor failures (non-zero exit code, missing manifest, unexpected document counts).

## 8. Security

- Backup files contain **password hashes and personal data**. Encrypt them at rest and in transit.
- Restrict access to the backup directory and offsite bucket (least privilege, object-lock/immutability where available).
- Do not commit backups to git; `backups/` is in `.gitignore`.
- Rotate credentials and test that backups can be restored with the current MongoDB version.
- Keep at least one copy outside the primary region/provider.

## 9. Restore drills

A backup is only useful if it restores. Run a drill regularly:

1. Provision an isolated database.
2. Restore the latest backup.
3. Run `npm run indexes`.
4. Start the API against the restored database.
5. Verify login, product listing, order detail, review list, and analytics.
6. Compare document counts and spot-check `_id`/reference types.
7. Record the restore duration (RTO) and the backup timestamp (RPO).

The verification performed for this project:

```text
counts: { users: 41, products: 500, orders: 60, reviews: 158 }
ObjectId and Date types preserved: true
```

## 10. Limitations of the JSON tool

| Limitation | Impact | Mitigation |
| --- | --- | --- |
| Loads entire collections into memory | Not suitable for very large datasets | Use `mongodump`/snapshots/Atlas |
| No oplog/point-in-time replay | RPO limited by backup interval | Use `--oplog` or PITR |
| No built-in encryption | Backups contain sensitive data | Encrypt at rest/transport |
| No retention automation | Disk growth | Add a retention job |
| No partial/selective restore | Whole collection replaced | Restore to a temp DB and copy documents |
| Indexes not included | Fresh restore lacks indexes | Run `npm run indexes` |

## 11. Commands summary

```bash
npm run seed        # rebuild demo data
npm run backup      # timestamped canonical EJSON backup + manifest
npm run restore     # restore newest backup (destructive)
npm run restore -- ./backups/<timestamp>
npm run indexes     # recreate indexes after a fresh restore
```
