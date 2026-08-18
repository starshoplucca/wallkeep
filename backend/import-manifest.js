import fs from 'node:fs';
import vision from '@google-cloud/vision';

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'europe-west1';
const PRODUCT_SET_ID = process.env.GCP_PRODUCT_SET_ID;
const MANIFEST = process.argv[2];

if (!PROJECT_ID || !PRODUCT_SET_ID || !MANIFEST) {
  console.error('Uso: GCP_PROJECT_ID=... GCP_PRODUCT_SET_ID=... node import-manifest.js manifest.json');
  process.exit(1);
}

const client = new vision.ProductSearchClient();
const parent = client.locationPath(PROJECT_ID, LOCATION);
const productSetPath = client.productSetPath(PROJECT_ID, LOCATION, PRODUCT_SET_ID);

async function ensureProductSet() {
  try { await client.getProductSet({ name: productSetPath }); }
  catch (e) {
    if (e.code !== 5) throw e;
    await client.createProductSet({ parent, productSetId: PRODUCT_SET_ID, productSet: { displayName: PRODUCT_SET_ID } });
  }
}

function safeId(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0,120);
}

async function main() {
  await ensureProductSet();
  const cards = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  for (const [i, card] of cards.entries()) {
    const productId = safeId(card.productId || card.externalId || `${card.game}-${card.setCode}-${card.collector}-${i}`);
    const productPath = client.productPath(PROJECT_ID, LOCATION, productId);
    const product = {
      displayName: card.name,
      description: card.description || '',
      productCategory: 'general',
      productLabels: [
        { key: 'game', value: String(card.game || '').toLowerCase() },
        { key: 'set_code', value: String(card.setCode || '') },
        { key: 'set_name', value: String(card.setName || '') },
        { key: 'collector', value: String(card.collector || '') },
        { key: 'external_id', value: String(card.externalId || '') },
        { key: 'image_url', value: String(card.image || '') },
        ...(card.color ? [{ key: 'color', value: String(card.color).toLowerCase() }] : [])
      ]
    };

    try { await client.createProduct({ parent, product, productId }); }
    catch (e) { if (e.code !== 6) throw e; }
    try { await client.addProductToProductSet({ name: productSetPath, product: productPath }); }
    catch (e) { if (e.code !== 6) throw e; }

    if (card.gcsUri) {
      const refId = safeId(`ref-${productId}`);
      try { await client.createReferenceImage({ parent: productPath, referenceImageId: refId, referenceImage: { uri: card.gcsUri } }); }
      catch (e) { if (e.code !== 6) throw e; }
    }
    console.log(`${i + 1}/${cards.length} ${card.name} ${card.setCode || ''} ${card.collector || ''}`);
  }
  console.log('Catalogo importato. Attendere l’indicizzazione di Product Search prima dei test.');
}

main().catch(e => { console.error(e); process.exit(1); });
