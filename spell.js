/* 영어 철자 검사 · 자동완성
 * Hunspell en_US 사전 데이터(.aff 규칙 + .dic 단어 목록)를 직접 읽어서
 * 변화형(복수 -s, 과거 -ed, -ing, -er, -ly 등)까지 펼친 단어 집합을 만들어 씁니다.
 * 사전 데이터: SCOWL/Hunspell en_US (typo-js 패키지에 포함된 파일, LGPL/BSD)
 */
const DICT_BASE = 'https://cdn.jsdelivr.net/npm/typo-js@1.2.4/dictionaries/en_US/';

// 단어장에서 자주 쓰는 약어·기호 단어는 철자 검사에서 뺍니다.
const SKIP = new Set(['sb', 'sth', "sb's", "sth's", 'smb', 'smth', 'sw', 'etc', 'vs', 'e.g', 'i.e', 'cf', 'adj', 'adv', 'n', 'v', 'prep', 'conj', 'pl']);

let dict = null;
let loading = null;
const sugCache = new Map();

export const isReady = () => !!dict;

async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`사전을 불러오지 못했어요 (${r.status})`);
  return new TextDecoder('iso-8859-1').decode(await r.arrayBuffer());
}

function parseAff(text) {
  const rules = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const p = lines[i].trim().split(/\s+/);
    if ((p[0] === 'PFX' || p[0] === 'SFX') && p.length === 4 && /^\d+$/.test(p[3])) {
      const [type, flag, cross, count] = p;
      const list = [];
      for (let j = 1; j <= +count; j++) {
        const q = (lines[i + j] || '').trim().split(/\s+/);
        const strip = q[2] === '0' ? '' : q[2];
        const add = q[3] === '0' ? '' : q[3].split('/')[0];
        const cond = q[4] || '.';
        list.push({ strip, add, re: new RegExp(type === 'SFX' ? `${cond}$` : `^${cond}`) });
      }
      rules[flag] = { type, cross: cross === 'Y', list };
      i += +count;
    }
  }
  return rules;
}

function build(affText, dicText) {
  const rules = parseAff(affText);
  const forms = new Set();
  const bases = [];
  const lines = dicText.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const s = line.indexOf('/');
    const w = s < 0 ? line : line.slice(0, s);
    const flags = s < 0 ? '' : line.slice(s + 1);
    forms.add(w);
    if (/^[a-z]{2,}$/.test(w)) bases.push([w, flags.length]);   // 규칙(변화형)이 많은 단어일수록 흔한 단어
    if (!flags) continue;
    const crossSfx = [];
    for (const f of flags) {
      const r = rules[f];
      if (!r || r.type !== 'SFX') continue;
      for (const x of r.list) {
        if (w.endsWith(x.strip) && x.re.test(w)) {
          const nw = w.slice(0, w.length - x.strip.length) + x.add;
          forms.add(nw);
          if (r.cross) crossSfx.push(nw);
        }
      }
    }
    for (const f of flags) {
      const r = rules[f];
      if (!r || r.type !== 'PFX') continue;
      for (const x of r.list) {
        if (!x.re.test(w)) continue;
        forms.add(x.add + w.slice(x.strip.length));
        if (r.cross) for (const c of crossSfx) forms.add(x.add + c);
      }
    }
  }
  const lowerList = [];
  for (const f of forms) if (/^[a-z]+$/.test(f)) lowerList.push(f);
  bases.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return { forms, lowerList, bases };
}

/** 사전을 한 번만 불러옵니다. 실패해도 앱은 그대로 동작합니다. */
export function loadDictionary() {
  if (!loading) {
    loading = Promise.all([fetchText(DICT_BASE + 'en_US.aff'), fetchText(DICT_BASE + 'en_US.dic')])
      .then(([aff, dic]) => { dict = build(aff, dic); return true; })
      .catch(e => { console.warn(e); loading = null; return false; });
  }
  return loading;
}

function known(w) {
  if (dict.forms.has(w)) return true;
  const l = w.toLowerCase();
  if (dict.forms.has(l)) return true;
  // 문장 첫 글자처럼 대문자로 시작한 일반 단어
  return false;
}

/** 단어(토큰) 하나의 철자가 맞으면 true. 사전이 없으면 늘 true. */
export function check(token) {
  if (!dict) return true;
  const w = cleanToken(token);
  if (!w || w.length < 2 || /\d/.test(w)) return true;
  if (SKIP.has(w.toLowerCase())) return true;
  if (/^[A-Z]{2,5}s?$/.test(w)) return true;          // TV, CEO 같은 약어
  if (known(w)) return true;
  if (w.includes('-')) return w.split('-').every(p => !p || check(p));
  if (/'s$/i.test(w)) return known(w.slice(0, -2));
  if (w.endsWith("'")) return known(w.slice(0, -1));
  return false;
}

/** 토큰 앞뒤의 괄호·쉼표·물결 같은 기호를 떼어냅니다. */
export function cleanToken(token) {
  return String(token).replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
}

// 두 단어 사이의 편집 거리 (글자 바꿈 포함), max를 넘으면 max+1
function distance(a, b, max) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  let prev2 = null, prev = new Array(m + 1), cur = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur; cur = new Array(m + 1);
  }
  return prev[m];
}

/** 틀린 단어에 대한 추천 단어 (최대 n개) */
export function suggest(token, n = 3) {
  if (!dict) return [];
  const w = cleanToken(token).toLowerCase();
  if (sugCache.has(w)) return sugCache.get(w).slice(0, n);
  const found = [];
  for (const c of dict.lowerList) {
    if (Math.abs(c.length - w.length) > 2) continue;
    const d = distance(w, c, 2);
    if (d <= 2) found.push([d, c]);
  }
  found.sort((x, y) =>
    x[0] - y[0]
    || (x[1][0] === w[0] ? 0 : 1) - (y[1][0] === w[0] ? 0 : 1)
    || Math.abs(x[1].length - w.length) - Math.abs(y[1].length - w.length)
    || (x[1] < y[1] ? -1 : 1));
  const out = found.map(f => f[1]).slice(0, 5);
  sugCache.set(w, out);
  return out.slice(0, n);
}

/** prefix로 시작하는 사전 단어 (짧은 단어 먼저) */
export function complete(prefix, n = 5) {
  if (!dict) return [];
  const p = prefix.toLowerCase();
  const arr = dict.bases;
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid][0] < p) lo = mid + 1; else hi = mid; }
  const hits = [];
  for (let i = lo; i < arr.length && hits.length < 400 && arr[i][0].startsWith(p); i++) if (arr[i][0] !== p) hits.push(arr[i]);
  hits.sort((a, b) => Math.min(b[1], 4) - Math.min(a[1], 4) || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1));
  return hits.slice(0, n).map(h => h[0]);
}
