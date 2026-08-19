import json, os, re, sys, time
from io import BytesIO
import requests
import torch
from PIL import Image
from torchvision import models, transforms

OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'op16-index.json')
API = 'https://optcgapi.com/api/allSetCards/'

weights = models.MobileNet_V3_Small_Weights.DEFAULT
model = models.mobilenet_v3_small(weights=weights)
model.classifier = torch.nn.Identity()
model.eval()
prep = weights.transforms()

def norm(v):
    v = v / (torch.linalg.vector_norm(v) + 1e-12)
    return [round(float(x), 6) for x in v]

def code_of(x):
    vals = [x.get('card_set_id'), x.get('card_id'), x.get('card_image_id')]
    for v in vals:
        s = str(v or '')
        m = re.search(r'OP16-\d{3}', s)
        if m: return m.group(0)
    return ''

def image_of(x):
    return x.get('card_image') or x.get('image') or ''

def main():
    r = requests.get(API, timeout=60)
    r.raise_for_status()
    raw = r.json()
    cards = []
    seen = set()
    for x in raw if isinstance(raw, list) else []:
        code = code_of(x)
        url = image_of(x)
        if not code or not url or code in seen: continue
        seen.add(code)
        cards.append((code, url, x))
    cards.sort(key=lambda z: z[0])
    print('OP16 cards:', len(cards))
    rows = []
    for i,(code,url,x) in enumerate(cards,1):
        try:
            rr = requests.get(url, timeout=30)
            rr.raise_for_status()
            im = Image.open(BytesIO(rr.content)).convert('RGB')
            inp = prep(im).unsqueeze(0)
            with torch.no_grad():
                vec = model(inp)[0]
            rows.append({
                'id': code,
                'name': x.get('card_name') or x.get('name') or code,
                'setName': x.get('set_name') or x.get('card_set') or 'OP16',
                'setCode': 'OP16',
                'collector': code,
                'image': url,
                'color': x.get('card_color') or x.get('color') or '',
                'vec': norm(vec)
            })
            print(i, code, 'ok')
        except Exception as e:
            print(i, code, 'FAIL', e, file=sys.stderr)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'model':'torchvision-mobilenet-v3-small','set':'OP16','count':len(rows),'cards':rows}, f, ensure_ascii=False, separators=(',',':'))
    print('wrote', OUT, len(rows))
    if len(rows) < 80:
        raise SystemExit('Too few embeddings generated')

if __name__ == '__main__':
    main()
