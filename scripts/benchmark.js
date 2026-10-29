const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const Product = require('../src/models/Product');

function summarize(explain) {
  const stats = explain.executionStats || {};
  const winning = explain.queryPlanner?.winningPlan || {};
  const stages = [];
  let node = winning;
  while (node) {
    if (node.stage) stages.push(node.stage);
    node = node.inputStage || node.inputStages?.[0];
  }
  return {
    stage: stages.join(' -> ') || winning.stage || 'UNKNOWN',
    docsExamined: stats.totalDocsExamined ?? 0,
    keysExamined: stats.totalKeysExamined ?? 0,
    returned: stats.nReturned ?? 0,
    timeMs: stats.executionTimeMillis ?? 0,
  };
}

async function explainQuery(label, query, hintNatural = false) {
  let q = query.clone ? query.clone() : query;
  if (hintNatural) q = q.hint({ $natural: 1 });
  try {
    const explain = await q.explain('executionStats');
    return { label, ...summarize(explain) };
  } catch (err) {
    return { label, stage: `ERROR: ${err.message}`, docsExamined: 0, keysExamined: 0, returned: 0, timeMs: 0 };
  }
}

async function main() {
  await connectDatabase();
  const count = await Product.countDocuments();
  console.log(`Benchmarking ${count} product documents\n`);

  const scenarios = [
    {
      label: 'Category + price range',
      query: Product.find({ category: 'Mobiles', price: { $gte: 10000, $lte: 50000 } }).sort({ price: -1 }).limit(20),
    },
    {
      label: 'Brand equality + sort',
      query: Product.find({ brand: 'Samsung' }).sort({ price: -1 }).limit(20),
    },
    {
      label: 'Tags multikey',
      query: Product.find({ tags: 'best-seller' }).limit(20),
    },
    {
      label: 'Rating top-N',
      query: Product.find({ isActive: true }).sort({ rating: -1 }).limit(10),
    },
    {
      label: 'Text search',
      query: Product.find({ $text: { $search: 'Samsung' } }, { score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } }).limit(10),
      skipNatural: true,
    },
    {
      label: 'Geospatial $near',
      query: Product.find({
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [77.5, 11.5] },
            $maxDistance: 10000,
          },
        },
      }).limit(10),
      skipNatural: true,
    },
  ];

  const rows = [];
  for (const s of scenarios) {
    const withIndex = await explainQuery(s.label, s.query, false);
    rows.push({ ...withIndex, mode: 'INDEX' });
    if (!s.skipNatural) {
      const natural = await explainQuery(s.label, s.query, true);
      rows.push({ ...natural, mode: 'COLLSCAN' });
    }
  }

  console.log('Scenario                    Mode      Stage                                     Docs   Keys   Returned  ms');
  console.log('-'.repeat(110));
  for (const r of rows) {
    console.log(
      `${r.label.padEnd(26)} ${r.mode.padEnd(9)} ${String(r.stage).slice(0, 40).padEnd(42)} ${String(r.docsExamined).padStart(5)} ${String(r.keysExamined).padStart(6)} ${String(r.returned).padStart(9)} ${String(r.timeMs).padStart(4)}`
    );
  }

  console.log('\nNotes: COLLSCAN rows use hint({$natural:1}) to force a collection scan');
  console.log('even while the index exists, making before/after comparable on one dataset.');

  await disconnectDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
