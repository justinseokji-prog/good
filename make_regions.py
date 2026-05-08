import json
import sys
sys.path.append('.')
from regions import REGIONS

with open('regions.js', 'w', encoding='utf-8') as f:
    f.write('const REGIONS = ')
    json.dump(REGIONS, f, ensure_ascii=False)
    f.write(';')
