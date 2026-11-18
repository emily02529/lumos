/* LUMOS 단어 공부 — 학생용 (로그인 없이 읽기만) */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBrN7MTWCAs2qVBzAUjEGrFRkv-yVILxYw',
  authDomain: 'lumos-988e9.firebaseapp.com',
  projectId: 'lumos-988e9',
  storageBucket: 'lumos-988e9.firebasestorage.app',
  messagingSenderId: '795153527123',
  appId: '1:795153527123:web:8233b79fff6efe602af1a6',
};
const fs = getFirestore(initializeApp(firebaseConfig));
const PREF_KEY = 'lumos-study-pref';
const WRONG_KEY = 'lumos-study-wrong';   // 오답 노트 (이 기기에만 저장)
const $app = document.getElementById('app');

/* ---------- 공통 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
const ICON = {
  card: '<rect x="3" y="6" width="14" height="13" rx="2.5"/><path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V16"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
};
const ic = n => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}
function loadPref() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } }
function savePref() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ bookId: S.bookId, mode: S.mode, dir: S.dir, shuffle: S.shuffle, count: S.count })); } catch (e) { /* */ }
}

/* ---------- 오답 노트 ---------- */
const wkey = w => norm(w.en) + '|' + norm(w.ko);
function loadWrong() { try { const a = JSON.parse(localStorage.getItem(WRONG_KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveWrong(list) { try { localStorage.setItem(WRONG_KEY, JSON.stringify(list.slice(-500))); } catch (e) { /* */ } }
function markWrong(w) {
  const list = loadWrong();
  const k = wkey(w);
  const old = list.find(x => wkey(x) === k);
  if (old) { old.miss = (old.miss || 1) + 1; old.at = Date.now(); }
  else list.push({ en: w.en, ko: w.ko, from: w.from || '', miss: 1, at: Date.now() });
  saveWrong(list);
}
function markRight(w) {
  const k = wkey(w);
  const list = loadWrong();
  if (list.some(x => wkey(x) === k)) saveWrong(list.filter(x => wkey(x) !== k));
}

/* 선생님 화면과 같은 규칙으로 단어 입력을 읽음 */
function parse(text) {
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const questions = [];
  let cur = null, en = [], ko = [];
  const kind = t => (/^\d{1,3}[.)]?$/.test(t) ? 'num' : /[ㄱ-ㆎ가-힣]/.test(t) ? 'ko' : /[A-Za-z]/.test(t) ? 'en' : 'sym');
  const flush = () => {
    if (en.length || ko.length) {
      if (!cur) { cur = { no: String(questions.length + 1).padStart(2, '0'), words: [] }; questions.push(cur); }
      cur.words.push({ en: en.join(' '), ko: ko.join(' ') });
    }
    en = []; ko = [];
  };
  for (const t of tokens) {
    const k = kind(t);
    if (k === 'num') { flush(); cur = { no: t.replace(/[.)]$/, '').padStart(2, '0'), words: [] }; questions.push(cur); }
    else if (k === 'en') { if (ko.length) flush(); en.push(t); }
    else if (k === 'ko' || en.length || ko.length) ko.push(t);
  }
  flush();
  return questions.filter(q => q.words.length);
}

/* ---------- 상태 ---------- */
let keyHandler = null;   // 지금 화면의 키보드 단축키
const pref = loadPref();
const S = {
  books: [], bookId: pref.bookId || null, units: [], unitIds: [], qsel: {},
  mode: pref.mode || 'card', dir: pref.dir || 'en2ko', shuffle: pref.shuffle !== false, count: pref.count || null,
  deck: [], i: 0, results: [], flipped: false, locked: false,
};

/* ---------- 데이터 ---------- */
async function loadBooks() {
  const snap = await getDocs(collection(fs, 'books'));
  S.books = snap.docs.map(d => ({ id: d.id, name: d.data().name, order: d.data().order ?? 0 })).sort((a, b) => a.order - b.order);
}
async function loadUnits(bookId) {
  const snap = await getDocs(query(collection(fs, 'units'), where('bookId', '==', bookId)));
  S.units = snap.docs.map(d => {
    const v = d.data();
    return { id: d.id, name: v.name, order: v.order ?? 0, questions: parse(v.raw || '') };
  }).filter(u => u.questions.length).sort((a, b) => a.order - b.order);
}
function failView(e) {
  console.error(e);
  const denied = e && e.code === 'permission-denied';
  $app.innerHTML = `<div class="card notice-big"><b>${denied ? '아직 공개되지 않았어요' : '단어장을 불러오지 못했어요'}</b>
    ${denied ? '선생님께 학생용 공개 설정을 부탁드려 주세요.' : '인터넷 연결을 확인하고 다시 시도해 주세요.'}
    <div style="margin-top:18px"><button class="btn primary" onclick="location.reload()">다시 시도</button></div></div>`;
}

/* ---------- 1. 범위 고르기 ---------- */
const selOf = u => (S.qsel[u.id] ? new Set(S.qsel[u.id]) : null);
const pickedQs = u => { const s = selOf(u); return s ? u.questions.filter(q => s.has(q.no)) : u.questions; };
function pickedWords() {
  const out = [];
  for (const u of S.units) {
    if (!S.unitIds.includes(u.id)) continue;
    for (const q of pickedQs(u)) for (const w of q.words) if (w.en && w.ko) out.push({ ...w, from: `${u.name} · ${q.no}번` });
  }
  return out;
}

function renderSetup() {
  keyHandler = null;   // 범위 화면에서는 키보드 단축키 끄기
  const units = S.units.filter(u => S.unitIds.includes(u.id));
  const total = pickedWords().length;
  const allOn = S.units.length && units.length === S.units.length;
  const dirs = [['en2ko', '영어 → 뜻'], ['ko2en', '뜻 → 영어'], ['mix', '섞기']];
  const wrong = loadWrong();
  const pick = () => (S.count ? Math.min(S.count, total) : total);
  const presets = [10, 20, 30, 50].filter(n => n < total);
  $app.innerHTML = `
    <div class="hero"><h1>단어 공부</h1><p>공부할 범위를 고르고 시작해요.</p></div>
    ${wrong.length ? `<div class="wnote">
      <div class="wnote-head">
        <span class="wnote-ico">${ic('x')}</span>
        <div class="wnote-t"><b>오답 노트 <span>${wrong.length}</span></b><small>틀렸거나 몰랐던 단어예요. 맞히면 노트에서 빠져요.</small></div>
      </div>
      <div class="wnote-words">${wrong.slice(-6).reverse().map(w => `<span>${esc(w.en)}</span>`).join('')}${wrong.length > 6 ? `<span class="more">+${wrong.length - 6}</span>` : ''}</div>
      <div class="wnote-actions">
        <button class="btn" id="wCard">${ic('card')}카드로 복습</button>
        <button class="btn primary" id="wQuiz">${ic('quiz')}퀴즈로 복습</button>
        <button class="btn ghost sm" id="wClear">비우기</button>
      </div>
    </div>` : ''}
    <div class="card">
      <div class="step">
        <div class="step-head"><span class="num">1</span><h3>교재</h3></div>
        ${S.books.length ? `<select id="sBook" style="max-width:420px">
          <option value="" ${S.bookId ? '' : 'selected'} disabled>교재를 골라 주세요</option>
          ${S.books.map(b => `<option value="${b.id}" ${b.id === S.bookId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>`
          : '<p class="muted" style="margin:0">아직 공개된 교재가 없어요.</p>'}
      </div>
      ${S.bookId ? `<div class="step">
        <div class="step-head"><span class="num">2</span><h3>단원</h3><span class="muted" style="font-size:14px">여러 개 고를 수 있어요</span>
          ${S.units.length ? `<button class="btn sm ghost aside" id="sAll">${allOn ? '전체 해제' : '전체 선택'}</button>` : ''}</div>
        ${S.units.length ? `<div class="unit-pick">${S.units.map(u => `
          <label class="check"><input type="checkbox" value="${u.id}" ${S.unitIds.includes(u.id) ? 'checked' : ''}>
          <span class="box">${ic('check')}</span><span class="name">${esc(u.name)}</span>
          <span class="count">${u.questions.reduce((s, q) => s + q.words.length, 0)}</span></label>`).join('')}</div>`
          : '<p class="muted" style="margin:0">이 교재에는 아직 단어가 없어요.</p>'}
      </div>` : ''}
      ${units.length ? `<div class="step">
        <div class="step-head"><span class="num">3</span><h3>문제 범위</h3><span class="muted" style="font-size:14px">번호를 눌러 켜고 꺼요</span></div>
        ${units.map(u => {
          const sel = selOf(u);
          return `<div class="qpick" data-u="${u.id}">
            <div class="qpick-head"><b>${esc(u.name)}</b>
              <span class="pill ${sel ? 'blue' : ''}">${sel ? `${sel.size}/${u.questions.length}문제` : `전체 ${u.questions.length}문제`}</span>
              <span class="spacer"></span>
              <input type="text" class="input qrange" placeholder="범위 입력 예: 1-5" inputmode="numeric" aria-label="${esc(u.name)} 문제 범위">
              <button class="btn sm ${sel ? 'ghost' : 'tonal'}" data-qall>전체</button>
              <button class="btn sm ghost" data-qnone>모두 끄기</button>
            </div>
            <div class="qchips">${u.questions.map(q => `<button class="qchip ${!sel || sel.has(q.no) ? 'on' : ''}" data-q="${esc(q.no)}">${esc(q.no)}<small>${q.words.length}단어</small></button>`).join('')}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="step">
        <div class="step-head"><span class="num">4</span><h3>공부 방법</h3></div>
        <div class="smodes">
          <button class="smode ${S.mode === 'card' ? 'on' : ''}" data-mode="card"><span class="ico">${ic('card')}</span><b>플래시카드</b><small>카드를 뒤집으며 외워요</small></button>
          <button class="smode ${S.mode === 'quiz' ? 'on' : ''}" data-mode="quiz"><span class="ico">${ic('quiz')}</span><b>객관식</b><small>4개 중에 골라요</small></button>
        </div>
        <div class="row" style="margin-top:14px;gap:10px">
          <div class="seg" id="sDir">${dirs.map(([v, l]) => `<button data-dir="${v}" class="${S.dir === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <label class="switch-row" style="padding:8px 14px;flex:0 0 auto">
            <span class="txt"><b>순서 섞기</b></span>
            <span class="switch"><input type="checkbox" id="sShuffle" ${S.shuffle ? 'checked' : ''}><span></span></span>
          </label>
        </div>
      </div>
      <div class="step">
        <div class="step-head"><span class="num">5</span><h3>문항 수</h3>${total ? `<span class="muted" style="font-size:14px">고른 범위에 단어 ${total}개</span>` : ''}</div>
        <div class="row" style="gap:10px">
          <div class="seg" id="sCountSeg">
            <button data-count="" class="${!S.count || S.count >= total ? 'on' : ''}">전체</button>
            ${presets.map(n => `<button data-count="${n}" class="${S.count === n ? 'on' : ''}">${n}</button>`).join('')}
          </div>
          <span class="row" style="gap:6px"><input type="number" class="input" id="sCount" min="1" max="${total || 1}" value="${total ? pick() : ''}" inputmode="numeric" style="width:96px;text-align:center" aria-label="문항 수 직접 입력"><span class="muted">개</span></span>
        </div>
        <p class="muted" style="font-size:13.5px;margin:10px 0 0">전체보다 적게 고르면 그만큼 무작위로 뽑아요.</p>
      </div>` : ''}
      <div class="cta-bar">
        <button class="btn primary xl" id="sStart" ${total ? '' : 'disabled'}>${total ? `${pick()}${S.mode === 'quiz' ? '문항 퀴즈' : '단어 공부'} 시작` : S.bookId ? (units.length ? '문제를 골라 주세요' : '단원을 골라 주세요') : '교재를 골라 주세요'}</button>
      </div>
    </div>`;

  const keepScroll = fn => () => { const y = window.scrollY; fn(); renderSetup(); window.scrollTo(0, y); };
  const $book = $app.querySelector('#sBook');
  if ($book) $book.onchange = async e => {
    S.bookId = e.target.value; S.unitIds = []; S.qsel = {}; savePref();
    $app.querySelector('#sStart').textContent = '불러오는 중…';
    try { await loadUnits(S.bookId); } catch (er) { return failView(er); }
    renderSetup();
  };
  $app.querySelectorAll('.unit-pick input').forEach(el => el.onchange = keepScroll(() => {
    S.unitIds = [...$app.querySelectorAll('.unit-pick input:checked')].map(x => x.value);
    for (const id of Object.keys(S.qsel)) if (!S.unitIds.includes(id)) delete S.qsel[id];
  }));
  const all = $app.querySelector('#sAll');
  if (all) all.onclick = keepScroll(() => { S.unitIds = allOn ? [] : S.units.map(u => u.id); S.qsel = {}; });
  $app.querySelectorAll('.qpick').forEach(box => {
    const u = S.units.find(x => x.id === box.dataset.u);
    const allNos = u.questions.map(q => q.no);
    const setSel = nos => keepScroll(() => { if (nos.length === allNos.length) delete S.qsel[u.id]; else S.qsel[u.id] = allNos.filter(n => nos.includes(n)); })();
    box.querySelectorAll('.qchip').forEach(ch => ch.onclick = () => {
      const cur = selOf(u) || new Set(allNos);
      if (cur.has(ch.dataset.q)) cur.delete(ch.dataset.q); else cur.add(ch.dataset.q);
      setSel([...cur]);
    });
    box.querySelector('[data-qall]').onclick = () => setSel(allNos);
    box.querySelector('[data-qnone]').onclick = () => setSel([]);
    const $r = box.querySelector('.qrange');
    const apply = () => {
      const want = new Set();
      for (const part of $r.value.split(/[,，]/)) {
        const m = part.trim().match(/^(\d+)\s*(?:[-~]\s*(\d+))?$/);
        if (!m) continue;
        let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
        for (let i = a; i <= b && i - a < 1000; i++) want.add(i);
      }
      const nos = allNos.filter(n => want.has(parseInt(n, 10)));
      if (!nos.length) return toast('예: 1-5 처럼 입력해 주세요');
      setSel(nos);
    };
    $r.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); apply(); } };
    $r.onchange = () => { if ($r.value.trim()) apply(); };
  });
  $app.querySelectorAll('[data-mode]').forEach(el => el.onclick = () => {
    S.mode = el.dataset.mode; savePref();
    $app.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === el));
  });
  $app.querySelectorAll('[data-dir]').forEach(el => el.onclick = () => {
    S.dir = el.dataset.dir; savePref();
    $app.querySelectorAll('[data-dir]').forEach(x => x.classList.toggle('on', x === el));
  });
  const sh = $app.querySelector('#sShuffle');
  if (sh) sh.onchange = e => { S.shuffle = e.target.checked; savePref(); };
  const ctaText = () => { if (total) $app.querySelector('#sStart').textContent = `${pick()}${S.mode === 'quiz' ? '문항 퀴즈' : '단어 공부'} 시작`; };
  $app.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', ctaText));
  const setCount = n => {
    S.count = !n || n >= total ? null : Math.max(1, Math.floor(n));
    savePref();
    $app.querySelectorAll('#sCountSeg button').forEach(x => x.classList.toggle('on', (+x.dataset.count || null) === (S.count && S.count < total ? S.count : null)));
    ctaText();
  };
  $app.querySelectorAll('#sCountSeg button').forEach(el => el.onclick = () => { setCount(+el.dataset.count || null); $app.querySelector('#sCount').value = pick(); });
  const $cnt = $app.querySelector('#sCount');
  if ($cnt) {
    $cnt.oninput = () => { const v = parseInt($cnt.value, 10); if (v > 0) setCount(v); };
    $cnt.onchange = () => { const v = parseInt($cnt.value, 10); setCount(v > 0 ? v : null); $cnt.value = pick(); };
  }
  $app.querySelector('#sStart').onclick = () => {
    let words = pickedWords();
    if (S.count && S.count < words.length) {
      const keep = new Set(shuffle(words.map((_, i) => i)).slice(0, S.count));
      words = words.filter((_, i) => keep.has(i));
    }
    start(words);
  };
  // 오답 노트
  const review = mode => { S.mode = mode; savePref(); start(loadWrong(), { review: true }); };
  const wc = $app.querySelector('#wCard'); if (wc) wc.onclick = () => review('card');
  const wq = $app.querySelector('#wQuiz'); if (wq) wq.onclick = () => review('quiz');
  const wx = $app.querySelector('#wClear'); if (wx) wx.onclick = () => {
    if (!confirm('오답 노트를 비울까요?')) return;
    saveWrong([]); toast('오답 노트를 비웠어요'); renderSetup();
  };
}

/* ---------- 2. 공부 ---------- */
function start(words, opt = {}) {
  if (!words.length) return;
  S.review = !!opt.review;
  S.deck = (S.shuffle ? shuffle(words) : words).map(w => ({
    ...w, ask: S.dir === 'mix' ? (Math.random() < .5 ? 'en2ko' : 'ko2en') : S.dir,
  }));
  // 객관식 오답 보기 후보: 고른 범위 → 부족하면 교재 전체 · 오답 노트까지
  S.pool = [...words, ...pickedWords()];
  if (S.pool.length < 8) S.pool.push(...S.units.flatMap(u => u.questions.flatMap(q => q.words)).filter(w => w.en && w.ko), ...loadWrong());
  S.i = 0; S.results = [];
  window.scrollTo(0, 0);
  if (S.mode === 'card') renderCard(); else renderQuiz();
}

const front = c => (c.ask === 'en2ko' ? c.en : c.ko);
const backSide = c => (c.ask === 'en2ko' ? c.ko : c.en);
const topBar = () => `
  <div class="play-top">
    <button class="btn sm ghost" id="pQuit">${ic('back')}그만하기</button>
    <span class="count">${Math.min(S.i + 1, S.deck.length)} / ${S.deck.length}</span>
  </div>
  <div class="bar"><i style="width:${(S.i / S.deck.length) * 100}%"></i></div>`;

/* 플래시카드 */
function renderCard() {
  if (S.i >= S.deck.length) return renderResult();
  const c = S.deck[S.i];
  S.flipped = false;
  $app.innerHTML = `${topBar()}
    <div class="fc" id="fc" role="button" tabindex="0" aria-label="카드 뒤집기">
      <div class="fc-inner">
        <div class="fc-face front"><span class="lbl">${c.ask === 'en2ko' ? 'English' : '뜻'}</span><div class="word">${esc(front(c))}</div><span class="hint">탭해서 뒤집기</span></div>
        <div class="fc-face back"><span class="lbl">${c.ask === 'en2ko' ? '뜻' : 'English'}</span><div class="word">${esc(backSide(c))}</div><div class="from">${esc(c.from)}</div></div>
      </div>
    </div>
    <div class="fc-actions">
      <button class="btn no" id="cNo">${ic('x')}몰라요</button>
      <button class="btn yes" id="cYes">${ic('check')}알아요</button>
    </div>
    <div class="keys"><kbd>Space</kbd> 뒤집기 · <kbd>←</kbd> 몰라요 · <kbd>→</kbd> 알아요</div>`;
  const $fc = $app.querySelector('#fc');
  const flip = () => { S.flipped = !S.flipped; $fc.classList.toggle('flipped', S.flipped); };
  const answer = known => { S.results.push({ ...c, ok: known }); if (known) markRight(c); else markWrong(c); S.i++; renderCard(); };
  // 탭 = 뒤집기, 좌우로 밀기 = 몰라요/알아요
  let sx = null, moved = false;
  $fc.onpointerdown = e => { sx = e.clientX; moved = false; };
  $fc.onpointermove = e => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 12) moved = true;
    $fc.classList.toggle('swipe-r', dx > 50); $fc.classList.toggle('swipe-l', dx < -50);
  };
  $fc.onpointerup = e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    $fc.classList.remove('swipe-r', 'swipe-l');
    if (dx > 80) answer(true); else if (dx < -80) answer(false); else if (!moved) flip();
  };
  $fc.onpointercancel = () => { sx = null; $fc.classList.remove('swipe-r', 'swipe-l'); };
  $app.querySelector('#cNo').onclick = () => answer(false);
  $app.querySelector('#cYes').onclick = () => answer(true);
  $app.querySelector('#pQuit').onclick = renderSetup;
  keyHandler = e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowLeft') answer(false);
    else if (e.key === 'ArrowRight') answer(true);
  };
}

/* 객관식 */
function choicesFor(c) {
  const key = c.ask === 'en2ko' ? 'ko' : 'en';
  const right = c[key];
  const seen = new Set([norm(right)]);
  const wrong = [];
  for (const w of shuffle(S.pool)) {
    const v = w[key];
    if (!v || seen.has(norm(v))) continue;
    seen.add(norm(v)); wrong.push(v);
    if (wrong.length === 3) break;
  }
  return shuffle([right, ...wrong]);
}
function renderQuiz() {
  if (S.i >= S.deck.length) return renderResult();
  const c = S.deck[S.i];
  const right = c.ask === 'en2ko' ? c.ko : c.en;
  const opts = choicesFor(c);
  S.locked = false;
  $app.innerHTML = `${topBar()}
    <div class="qz-card"><div class="ask">${c.ask === 'en2ko' ? '알맞은 뜻을 고르세요' : '알맞은 영어를 고르세요'}</div><div class="word">${esc(front(c))}</div></div>
    <div class="choices" id="choices">${opts.map((o, i) => `<button class="choice" data-i="${i}"><span class="no">${i + 1}</span><span class="txt">${esc(o)}</span></button>`).join('')}</div>
    <div class="qz-next" id="qzNext"></div>
    <div class="keys"><kbd>1</kbd>~<kbd>${opts.length}</kbd> 고르기 · <kbd>Enter</kbd> 다음</div>`;
  const $choices = $app.querySelector('#choices');
  const next = () => { S.i++; renderQuiz(); };
  const pick = i => {
    if (S.locked) return;
    S.locked = true;
    $choices.classList.add('locked');
    const ok = opts[i] === right;
    S.results.push({ ...c, ok, picked: opts[i] });
    if (ok) markRight(c); else markWrong(c);
    $choices.querySelectorAll('.choice').forEach((el, j) => {
      if (opts[j] === right) el.classList.add('ok');
      else if (j === i) el.classList.add('bad');
      else el.classList.add('dim');
    });
    if (ok) setTimeout(() => { if (S.deck[S.i] === c) next(); }, 650);
    else {
      $app.querySelector('#qzNext').innerHTML = '<button class="btn primary xl" id="qzGo">다음</button>';
      $app.querySelector('#qzGo').onclick = next;
    }
  };
  $choices.querySelectorAll('.choice').forEach(el => el.onclick = () => pick(+el.dataset.i));
  $app.querySelector('#pQuit').onclick = renderSetup;
  keyHandler = e => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= opts.length) pick(n - 1);
    else if (e.key === 'Enter' && S.locked) next();
  };
}

/* ---------- 3. 결과 ---------- */
function renderResult() {
  keyHandler = null;
  const total = S.results.length;
  const good = S.results.filter(r => r.ok).length;
  const bad = S.results.filter(r => !r.ok);
  const isQuiz = S.mode === 'quiz';
  const pct = total ? Math.round((good / total) * 100) : 0;
  const msg = pct === 100 ? '완벽해요!' : pct >= 80 ? '아주 잘했어요' : pct >= 50 ? '조금만 더 해볼까요?' : '한 번 더 복습해 봐요';
  $app.innerHTML = `
    <div class="card result">
      <div class="big">${good}<small> / ${total}</small></div>
      <div class="msg">${msg}</div>
      <div class="sub">${isQuiz ? `맞힌 문제 ${good}개 · 틀린 문제 ${bad.length}개` : `알아요 ${good}개 · 몰라요 ${bad.length}개`}</div>
      ${bad.length ? `<div class="note-saved">${ic('check')}${isQuiz ? '틀린 단어' : '모르는 단어'} ${bad.length}개를 오답 노트에 담았어요</div>` : S.review ? `<div class="note-saved">${ic('check')}복습한 단어를 오답 노트에서 뺐어요</div>` : ''}
      <div class="result-actions">
        ${bad.length ? `<button class="btn primary xl" id="rBad">${isQuiz ? '틀린 것만 다시 풀기' : '모르는 단어만 다시 보기'} (${bad.length})</button>` : ''}
        <button class="btn ${bad.length ? '' : 'primary'} xl" id="rAgain">처음부터 다시</button>
        <button class="btn ghost" id="rSetup">${S.review ? '처음 화면으로' : '범위 다시 고르기'}</button>
      </div>
    </div>
    ${bad.length ? `<div class="card wrong-list"><div class="card-title">${isQuiz ? '틀린 단어' : '모르는 단어'}</div>
      ${bad.map(r => `<div class="wrong-row"><b>${esc(r.en)}</b><span>${esc(r.ko)}${isQuiz ? `<em>내가 고른 답: ${esc(r.picked)}</em>` : ''}</span></div>`).join('')}
    </div>` : ''}`;
  const again = list => start(list.map(({ ok, picked, ask, ...w }) => w), { review: S.review });
  const rb = $app.querySelector('#rBad'); if (rb) rb.onclick = () => again(bad);
  $app.querySelector('#rAgain').onclick = () => again(S.results);
  $app.querySelector('#rSetup').onclick = renderSetup;
}

/* ---------- 키보드 ---------- */
document.addEventListener('keydown', e => {
  if (!keyHandler || e.target.matches('input, select, textarea')) return;
  if (e.target.matches('button') && (e.key === ' ' || e.key === 'Enter')) return;   // 버튼은 브라우저 기본 동작으로
  keyHandler(e);
});

/* ---------- 시작 ---------- */
(async () => {
  $app.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  try {
    await loadBooks();
    if (S.books.length === 1) S.bookId = S.books[0].id;
    if (S.bookId && !S.books.some(b => b.id === S.bookId)) S.bookId = null;
    if (S.bookId) await loadUnits(S.bookId);
  } catch (e) { return failView(e); }
  renderSetup();
})();
