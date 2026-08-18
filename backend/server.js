import express from 'express';
import vision from '@google-cloud/vision';

const app = express();
app.use(express.json({ limit: '12mb' }));

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || 'europe-west1';
const PRODUCT_SETS = {
  pokemon: process.env.GCP_PRODUCT_SET_POKEMON || 'wallkeep-pokemon',
  onepiece: process.env.GCP_PRODUCT_SET_ONEPIECE || 'wallkeep-onepiece',
  magic: process.env.GCP_PRODUCT_SET_MAGIC || 'wallkeep-magic'
};

const productSearchClient = new vision.ProductSearchClient();
const imageAnnotatorClient = new vision.ImageAnnotatorClient();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'wallkeep-vision', projectConfigured: !!PROJECT_ID, location: LOCATION });
});

function parseProduct(product, score) {
  const labels = {};
  for (const x of product?.productLabels || []) labels[x.key] = x.value;
  return {
    id: product?.name?.split('/').pop() || '',
    name: product?.displayName || labels.name || '',
    description: product?.description || '',
    score: Number(score || 0),
    game: labels.game || '',
    setCode: labels.set_code || '',
    setName: labels.set_name || '',
    collector: labels.collector || '',
    image: labels.image_url || '',
    externalId: labels.external_id || '',
    color: labels.color || ''
  };
}

app.post('/search', async (req, res) => {
  try {
    if (!PROJECT_ID) return res.status(500).json({ error: 'GCP_PROJECT_ID non configurato' });
    const { game, imageBase64, colorHint, maxResults = 12 } = req.body || {};
    if (!PRODUCT_SETS[game]) return res.status(400).json({ error: 'game non valido' });
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 mancante' });

    const productSetPath = productSearchClient.productSetPath(PROJECT_ID, LOCATION, PRODUCT_SETS[game]);
    const productCategory = 'general';
    const request = {
      image: { content: imageBase64.replace(/^data:image\/[^;]+;base64,/, '') },
      features: [{ type: 'PRODUCT_SEARCH', maxResults: Math.min(30, Number(maxResults) || 12) }],
      imageContext: {
        productSearchParams: {
          productSet: productSetPath,
          productCategories: [productCategory],
          ...(colorHint ? { filter: `color=${String(colorHint).toLowerCase()}` } : {})
        }
      }
    };

    let [result] = await imageAnnotatorClient.annotateImage(request);
    let matches = result?.productSearchResults?.results || [];

    // If a strict color filter yields nothing, retry without it. Color is a strong hint, not an absolute gate.
    if (!matches.length && colorHint) {
      delete request.imageContext.productSearchParams.filter;
      [result] = await imageAnnotatorClient.annotateImage(request);
      matches = result?.productSearchResults?.results || [];
    }

    const candidates = matches.map(x => parseProduct(x.product, x.score));
    res.json({ ok: true, game, candidates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`WallKeep Vision listening on ${port}`));
