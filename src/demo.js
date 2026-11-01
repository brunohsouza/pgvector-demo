// Terminal version of the demo: the same CRUD steps as the web page.
import { pool } from './db.js'
import { PROVIDER, MODEL, DIM } from './embed.js'
import { resetSampleData, search, updateDocument, deleteDocument } from './documents.js'

const question = 'the tax due when you sell shares at a profit'
const step = (title) => console.log(`\n=== ${title} ===`)
const show = async (q, opts) => console.table(
  (await search(q, opts)).rows.map(({ body, similarity, ...r }) => ({ ...r, similarity: similarity.toFixed(3) })),
)

try {
  console.log(`Embeddings: ${PROVIDER} · ${MODEL} · ${DIM} dimensions`)

  step('1 · CREATE')
  const ids = await resetSampleData()
  console.log(`Inserted ${ids.length} documents`)

  step(`2 · READ: "${question}"`)
  await show(question)

  step('3 · UPDATE: the pizza row becomes a tax row')
  await updateDocument(ids[4], {
    title: 'Crypto gains',
    topic: 'tax',
    body: 'Selling cryptocurrency for a profit is also a disposal for capital gains tax.',
  })
  await show(question)

  step('4 · DELETE: "Selling shares"')
  await deleteDocument(ids[0])
  await show(question)

  step('Bonus · filtered READ: pets only')
  try {
    await show('looking after a young cat', { topic: 'pets' })
  } catch (err) {
    if (err.status !== 400) throw err
    console.log(`Skipped: ${err.message}`)
  }
} finally {
  await pool.end()
}
