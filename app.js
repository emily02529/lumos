/* LUMOS 단어장 · 단어시험지 (Firebase 연동) */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 웹 앱 설정값 (공개되어도 되는 값입니다. 접근 제어는 Firestore 보안 규칙과 로그인으로 합니다)
const firebaseConfig = {
  apiKey: 'AIzaSyBrN7MTWCAs2qVBzAUjEGrFRkv-yVILxYw',
  authDomain: 'lumos-988e9.firebaseapp.com',
  projectId: 'lumos-988e9',
  storageBucket: 'lumos-988e9.firebasestorage.app',
  messagingSenderId: '795153527123',
  appId: '1:795153527123:web:8233b79fff6efe602af1a6',
};

const COLLECTIONS = ['books', 'units'];
const EMAIL_KEY = 'lumos-login-email';
const LOCAL_KEY = 'lumos-vocab-v1';           // 예전(브라우저 저장) 데이터
const MIGRATED_KEY = 'lumos-vocab-migrated';

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const fs = getFirestore(fbApp);
let user = null;

const $main = document.getElementById('main');
const $side = document.getElementById('sidebar');
const $stage = document.getElementById('pdf-stage');
const $modal = document.getElementById('modal-root');
const $logout = document.getElementById('logout');

/* ================= icons ================= */
const ICONS = {
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6a2 2 0 0 1 1.4.6l1.3 1.3a2 2 0 0 0 1.4.6h5.3A2.5 2.5 0 0 1 21 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  doc: '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  upload: '<path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14"/>',
  shuffle: '<path d="M16 4h4v4M4 20 20 4M20 16v4h-4M15 15l5 5M4 4l5 5"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v6H7z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5zM9 7h6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  sheet: '<path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8a4 4 0 0 1-.5 10z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};
const ic = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const COLORS = ['#3182f6', '#00b493', '#ff8a00', '#f04452', '#7d5cf6', '#00a3d9', '#e64980'];
const colorOf = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
const tile = (id, size = '', icon = 'folder') => `<span class="tile ${size}" style="--c:${colorOf(id)}">${ic(icon)}</span>`;

/* ================= state ================= */
let db = { books: [] };   // { books: [{ id, name, order, units: [{ id, name, order, raw, questions, updatedAt }] }] }
const ui = {
  view: 'home',
  bookId: null,
  unitId: null,
  open: {},
  test: { bookId: null, unitIds: [], mode: 'en', shuffle: false, count: null, title: '', rows: null, show: 'test' },
};
let pendingFlush = null;   // 단원 편집 중 저장 대기 작업

const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const book = id => db.books.find(b => b.id === id);
const unit = (b, id) => b && b.units.find(u => u.id === id);
const wordCount = u => u.questions.reduce((s, q) => s + q.words.length, 0);
const bookWords = b => b.units.reduce((s, u) => s + wordCount(u), 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const nb = n => n.toLocaleString('ko-KR');
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

/* ================= Naru storage ================= */
const bookData = b => ({ name: b.name, order: b.order });
const unitData = (b, u) => ({ bookId: b.id, name: u.name, order: u.order, raw: u.raw, updatedAt: u.updatedAt });

async function fetchAll(name) {
  const snap = await getDocs(collection(fs, name));
  return snap.docs.map(d => ({ id: d.id, data: d.data() }));
}

async function loadAll() {
  const [books, units] = await Promise.all(COLLECTIONS.map(fetchAll));
  const map = new Map();
  db = {
    books: books.map(d => {
      const b = { id: d.id, name: d.data.name, order: d.data.order ?? 0, units: [] };
      map.set(b.id, b);
      return b;
    }).sort(byOrder),
  };
  for (const d of units) {
    const b = map.get(d.data.bookId);
    if (!b) continue;
    const raw = d.data.raw || '';
    b.units.push({ id: d.id, name: d.data.name, order: d.data.order ?? 0, raw, questions: parse(raw), updatedAt: d.data.updatedAt || Date.now() });
  }
  db.books.forEach(b => b.units.sort(byOrder));
}

/* 서버 저장 실패를 한곳에서 처리 */
async function persist(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    toast(errorText(e, '저장하지 못했어요. 인터넷 연결을 확인해 주세요'));
    return false;
  }
}
function errorText(e, fallback) {
  const code = (e && e.code) || '';
  if (code === 'permission-denied') return '권한이 없어요. 다시 로그인하거나 Firestore 보안 규칙을 확인해 주세요';
  if (code === 'unauthenticated') return '로그인이 만료됐어요. 다시 로그인해 주세요';
  if (code === 'unavailable') return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요';
  if (code === 'resource-exhausted') return '오늘 무료 사용량을 넘었어요. 내일 다시 시도해 주세요';
  return fallback + (code ? ` (${code})` : '');
}
const saveBook = b => persist(() => setDoc(doc(fs, 'books', b.id), bookData(b)));
const saveUnit = (b, u) => persist(() => setDoc(doc(fs, 'units', u.id), unitData(b, u)));

/* 한 번에 최대 500개까지라 나눠서 batch */
async function batchAll(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(fs);
    for (const w of writes.slice(i, i + 400)) {
      if (w.set) batch.set(doc(fs, w.collection, w.set.id), w.set.data);
      else batch.delete(doc(fs, w.collection, w.delete.id));
    }
    await batch.commit();
  }
}
const setW = (collection, id, data) => ({ collection, set: { id, data } });
const delW = (collection, id) => ({ collection, delete: { id } });
const writesFor = books => books.flatMap(b => [setW('books', b.id, bookData(b)), ...b.units.map(u => setW('units', u.id, unitData(b, u)))]);

/* ================= parser =================
 *  - 숫자만 있는 토큰(01, 2, 3. 4)) → 새 문제 번호
 *  - 한글이 들어간 토큰 → 뜻
 *  - 알파벳이 들어간 토큰 → 영어 (연속된 영어 토큰은 하나의 표현: give up)
 *  - 기호만 있는 토큰(~, =, ,) → 뜻 쪽에 붙임
 */
function parse(text) {
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const questions = [];
  let cur = null, en = [], ko = [];

  const kind = t => {
    if (/^\d{1,3}[.)]?$/.test(t)) return 'num';
    if (/[ㄱ-ㆎ가-힣]/.test(t)) return 'ko';
    if (/[A-Za-z]/.test(t)) return 'en';
    return 'sym';
  };
  const flush = () => {
    if (en.length || ko.length) {
      if (!cur) { cur = { no: String(questions.length + 1).padStart(2, '0'), words: [] }; questions.push(cur); }
      cur.words.push({ en: en.join(' '), ko: ko.join(' ') });
    }
    en = []; ko = [];
  };

  for (const t of tokens) {
    const k = kind(t);
    if (k === 'num') {
      flush();
      cur = { no: t.replace(/[.)]$/, '').padStart(2, '0'), words: [] };
      questions.push(cur);
    } else if (k === 'en') {
      if (ko.length) flush();
      en.push(t);
    } else if (k === 'ko') {
      ko.push(t);
    } else if (en.length || ko.length) {
      ko.push(t);
    }
  }
  flush();
  return questions.filter(q => q.words.length);
}

/* ================= modal ================= */
function modal({ title, desc = '', input = null, ok = '확인', cancel = '취소', danger = false }) {
  return new Promise(resolve => {
    $modal.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h3>${esc(title)}</h3>${desc ? `<p>${desc}</p>` : ''}
      ${input ? `<input type="text" id="m-in" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" autocomplete="off">` : ''}
      <div class="modal-actions"><button class="btn" data-m="no">${cancel}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-m="ok">${ok}</button></div>
    </div></div>`;
    const back = $modal.firstElementChild;
    const $in = back.querySelector('#m-in');
    const okBtn = back.querySelector('[data-m=ok]');
    const sync = () => { if ($in) okBtn.disabled = !$in.value.trim(); };
    const close = val => {
      document.removeEventListener('keydown', onKey);
      back.classList.add('out');
      setTimeout(() => { $modal.innerHTML = ''; }, 150);
      resolve(val);
    };
    const onKey = e => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && !e.isComposing && !okBtn.disabled) { e.preventDefault(); okBtn.click(); }
    };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', e => { if (e.target === back) close(null); });
    back.querySelector('[data-m=no]').onclick = () => close(null);
    okBtn.onclick = () => close($in ? $in.value.trim() : true);
    if ($in) { $in.oninput = sync; sync(); setTimeout(() => { $in.focus(); $in.select(); }, 30); }
    else setTimeout(() => okBtn.focus(), 30);
  });
}

/* ================= navigation ================= */
function go(view, opts = {}) {
  if (pendingFlush) pendingFlush();
  Object.assign(ui, { view }, opts);
  if (ui.bookId) ui.open[ui.bookId] = true;
  render();
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g && user) {
    const v = g.dataset.go;
    if (v === 'test') openTest(ui.bookId, ui.view === 'unit' && ui.unitId ? [ui.unitId] : null);
    else go(v, v === 'home' ? { bookId: null, unitId: null } : {});
  }
});

function render() {
  if (!user) return renderLogin();
  document.body.classList.remove('signed-out');
  $logout.hidden = false;
  document.querySelectorAll('.tab').forEach(t => {
    const v = t.dataset.go;
    t.classList.toggle('active', v === ui.view || (v === 'home' && ['home', 'book', 'unit'].includes(ui.view)));
  });
  renderSidebar();
  ({ home: renderHome, book: renderBook, unit: renderUnit, test: renderTest, backup: renderBackup }[ui.view] || renderHome)();
}

const crumb = parts => `<nav class="crumb">${parts.map((p, i) =>
  (i ? ic('chevR') : '') + (p.go ? `<a ${p.go}>${esc(p.t)}</a>` : `<span>${esc(p.t)}</span>`)).join('')}</nav>`;

/* ================= login ================= */
function renderLogin(errMsg = '', keepEmail = null) {
  document.body.classList.add('signed-out');
  $logout.hidden = true;
  $side.innerHTML = '';
  let saved = '';
  try { saved = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { /* */ }
  if (keepEmail !== null) saved = keepEmail;
  $main.innerHTML = `<form class="card login" id="loginForm">
    <span class="tile" style="--c:#3182f6">${ic('lock')}</span>
    <h1>LUMOS 단어장</h1>
    <input type="email" class="input" id="lgEmail" placeholder="이메일" autocomplete="username" value="${esc(saved)}" required style="margin-bottom:8px">
    <input type="password" class="input" id="lgPw" placeholder="비밀번호" autocomplete="current-password" required style="margin-bottom:16px">
    <button class="btn primary xl" id="signIn" type="submit">로그인</button>
    ${errMsg ? `<div class="err">${esc(errMsg)}</div>` : ''}
  </form>`;
  const $f = $main.querySelector('#loginForm');
  setTimeout(() => $main.querySelector(saved ? '#lgPw' : '#lgEmail').focus(), 30);
  $f.onsubmit = async e => {
    e.preventDefault();
    const email = $f.querySelector('#lgEmail').value.trim();
    const pw = $f.querySelector('#lgPw').value;
    const btn = $f.querySelector('#signIn');
    btn.disabled = true; btn.textContent = '로그인 중…';
    try {
      await signInWithEmailAndPassword(auth, email, pw);
      try { localStorage.setItem(EMAIL_KEY, email); } catch (er) { /* */ }
    } catch (err) {
      console.error(err);
      const c = err.code || '';
      renderLogin(
        c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email' ? '이메일 또는 비밀번호가 맞지 않아요'
        : c === 'auth/too-many-requests' ? '시도가 너무 많았어요. 잠시 후 다시 해 주세요'
        : c === 'auth/network-request-failed' ? '인터넷 연결을 확인해 주세요'
        : `로그인하지 못했어요 (${c || err.message})`, email);
    }
  };
}
$logout.onclick = async () => {
  const ok = await modal({ title: '로그아웃할까요?', ok: '로그아웃' });
  if (!ok) return;
  if (pendingFlush) pendingFlush();
  try { await signOut(auth); } catch (e) { /* ignore */ }
  user = null; db = { books: [] };
  renderLogin();
};

/* ================= sidebar ================= */
function renderSidebar() {
  let h = `<div class="side-head"><h3>교재</h3><button class="btn icon" id="addBook" title="교재 추가" aria-label="교재 추가">${ic('plus')}</button></div>`;
  if (!db.books.length) h += `<div class="empty-side">교재가 아직 없어요.</div>`;
  for (const b of db.books) {
    const open = ui.open[b.id];
    const act = ui.bookId === b.id && ui.view === 'book';
    h += `<div class="book">
      <div class="book-row ${act ? 'active' : ''}" data-book="${b.id}">
        <span class="chev ${open ? 'open' : ''}" data-toggle="${b.id}">${ic('chevR', 'sm')}</span>
        ${tile(b.id)}
        <span class="name">${esc(b.name)}</span>
        <span class="count">${b.units.length}</span>
      </div>`;
    if (open) {
      h += `<div class="units">`;
      for (const u of b.units) {
        const a = ui.unitId === u.id && ui.view === 'unit';
        h += `<div class="unit-row ${a ? 'active' : ''}" data-book="${b.id}" data-unit="${u.id}">
          <span class="name">${esc(u.name)}</span><span class="count">${wordCount(u)}</span></div>`;
      }
      h += `<div class="add-unit" data-addunit="${b.id}">${ic('plus', 'sm')} 단원 추가</div></div>`;
    }
    h += `</div>`;
  }
  $side.innerHTML = h;

  $side.querySelector('#addBook').onclick = addBook;
  $side.querySelectorAll('[data-toggle]').forEach(el => el.onclick = e => {
    e.stopPropagation();
    ui.open[el.dataset.toggle] = !ui.open[el.dataset.toggle];
    renderSidebar();
  });
  $side.querySelectorAll('.book-row').forEach(el => el.onclick = () => go('book', { bookId: el.dataset.book, unitId: null }));
  $side.querySelectorAll('.unit-row').forEach(el => el.onclick = () => go('unit', { bookId: el.dataset.book, unitId: el.dataset.unit }));
  $side.querySelectorAll('[data-addunit]').forEach(el => el.onclick = () => addUnit(el.dataset.addunit));
}

async function addBook() {
  const name = await modal({ title: '새 교재 만들기', desc: '교재 이름을 입력해 주세요.', input: { placeholder: '예) 능률 VOCA 고교필수' }, ok: '만들기' });
  if (!name) return;
  const b = { id: uid(), name, order: Date.now(), units: [] };
  if (!(await saveBook(b))) return;
  db.books.push(b);
  go('book', { bookId: b.id, unitId: null });
}
async function addUnit(bookId) {
  const b = book(bookId);
  const name = await modal({ title: '새 단원 추가', desc: `<b>${esc(b.name)}</b>에 단원을 추가해요.`, input: { value: `Day ${String(b.units.length + 1).padStart(2, '0')}`, placeholder: '예) Day 01, Unit 3' }, ok: '추가' });
  if (!name) return;
  const u = { id: uid(), name, order: Date.now(), raw: '', questions: [], updatedAt: Date.now() };
  if (!(await saveUnit(b, u))) return;
  b.units.push(u);
  go('unit', { bookId, unitId: u.id });
}

/* ================= home ================= */
function localBooks() {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return [];
    const d = JSON.parse(localStorage.getItem(LOCAL_KEY));
    return d && Array.isArray(d.books) ? d.books.filter(b => b.units && b.units.length) : [];
  } catch (e) { return []; }
}

function migrateNotice() {
  const lb = localBooks();
  if (!lb.length) return '';
  return `<div class="notice blue">${ic('cloud')}<span>이 컴퓨터에만 저장된 교재 ${lb.length}권이 있어요. 온라인 단어장으로 옮길까요?</span>
    <span class="actions"><button class="btn sm ghost" id="mgSkip">안 할래요</button><button class="btn sm primary" id="mgGo">옮기기</button></span></div>`;
}
function bindMigrate() {
  const go1 = $main.querySelector('#mgGo');
  if (!go1) return;
  $main.querySelector('#mgSkip').onclick = () => { try { localStorage.setItem(MIGRATED_KEY, 'skip'); } catch (e) { /* */ } render(); };
  go1.onclick = async () => {
    go1.disabled = true;
    const lb = localBooks().map((b, i) => ({
      id: b.id, name: b.name, order: Date.now() + i,
      units: b.units.map((u, j) => ({ ...u, order: j, questions: parse(u.raw || '') })),
    }));
    toast('온라인으로 옮기는 중', true);
    const ok = await persist(() => batchAll(writesFor(lb)));
    if (!ok) { go1.disabled = false; return; }
    try { localStorage.setItem(MIGRATED_KEY, 'done'); } catch (e) { /* */ }
    for (const b of lb) {
      const ex = book(b.id);
      if (ex) Object.assign(ex, b); else db.books.push(b);
    }
    db.books.sort(byOrder);
    toast(`교재 ${lb.length}권을 옮겼어요`);
    render();
  };
}

function renderHome() {
  if (!db.books.length) {
    $main.innerHTML = `${migrateNotice()}<div class="welcome">
      <span class="tile" style="--c:#3182f6">${ic('book')}</span>
      <button class="btn primary xl" id="w-add" style="max-width:320px">첫 교재 만들기</button></div>`;
    $main.querySelector('#w-add').onclick = addBook;
    bindMigrate();
    return;
  }
  const nu = db.books.reduce((s, b) => s + b.units.length, 0);
  const nw = db.books.reduce((s, b) => s + bookWords(b), 0);
  let h = `<div class="hero"><h1>단어장</h1></div>
    ${migrateNotice()}
    <div class="stats">
      <div class="stat"><div class="k">교재</div><div class="v">${nb(db.books.length)}<small>권</small></div></div>
      <div class="stat"><div class="k">단원</div><div class="v">${nb(nu)}<small>개</small></div></div>
      <div class="stat"><div class="k">단어</div><div class="v">${nb(nw)}<small>개</small></div></div>
    </div>
    <div class="section-head"><h2>내 교재</h2></div>
    <div class="book-grid">`;
  for (const b of db.books) {
    const shown = b.units.slice(0, 5);
    h += `<div class="book-card">
      <div class="bc-head" data-open-book="${b.id}">${tile(b.id, 'md')}
        <div style="flex:1;min-width:0"><div class="bc-name">${esc(b.name)}</div><div class="bc-meta">단원 ${b.units.length}개 · 단어 ${nb(bookWords(b))}개</div></div>
        ${ic('chevR')}
      </div><ul>`;
    if (!b.units.length) h += `<li class="none">아직 단원이 없어요</li>`;
    for (const u of shown) h += `<li data-b="${b.id}" data-u="${u.id}"><span class="name">${esc(u.name)}</span><span class="count">${wordCount(u)}단어</span>${ic('chevR')}</li>`;
    if (b.units.length > shown.length) h += `<li class="more" data-open-book="${b.id}">${b.units.length - shown.length}개 더 보기</li>`;
    h += `</ul></div>`;
  }
  h += `<button class="add-card" id="h-add"><span class="plus">${ic('plus')}</span>새 교재 만들기</button></div>`;
  $main.innerHTML = h;
  $main.querySelector('#h-add').onclick = addBook;
  $main.querySelectorAll('[data-open-book]').forEach(el => el.onclick = () => go('book', { bookId: el.dataset.openBook, unitId: null }));
  $main.querySelectorAll('li[data-u]').forEach(el => el.onclick = () => go('unit', { bookId: el.dataset.b, unitId: el.dataset.u }));
  bindMigrate();
}

/* ================= book ================= */
function renderBook() {
  const b = book(ui.bookId);
  if (!b) return go('home');
  let h = crumb([{ t: '단어장', go: 'data-go="home"' }, { t: b.name }]) + `
    <div class="page-head">
      ${tile(b.id, 'lg')}
      <div class="titles"><h1 class="page">${esc(b.name)}</h1><div class="page-sub">단원 ${b.units.length}개 · 단어 ${nb(bookWords(b))}개</div></div>
      <div class="actions">
        <button class="btn icon" id="renameBook" title="이름 변경" aria-label="이름 변경">${ic('pencil')}</button>
        <button class="btn icon" id="delBook" title="교재 삭제" aria-label="교재 삭제">${ic('trash')}</button>
        <button class="btn tonal" id="bookTest" ${b.units.length ? '' : 'disabled'}>${ic('sheet')}시험지 만들기</button>
        <button class="btn primary" id="bookAddUnit">${ic('plus')}단원 추가</button>
      </div>
    </div>`;
  if (!b.units.length) {
    h += `<div class="list"><div class="empty"><b>단원이 비어 있어요</b><button class="btn primary" id="emptyAdd">${ic('plus')}첫 단원 추가</button></div></div>`;
  } else {
    h += `<div class="list">`;
    b.units.forEach((u, i) => {
      h += `<div class="list-row" data-u="${u.id}">
        <span class="idx">${i + 1}</span>
        <div class="main"><div class="t">${esc(u.name)}</div><div class="s">문제 ${u.questions.length}개 · 단어 ${wordCount(u)}개 · ${fmtDate(u.updatedAt)} 수정</div></div>
        <span class="order">
          <button class="btn icon" data-up="${i}" title="위로" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${ic('up', 'sm')}</button>
          <button class="btn icon" data-down="${i}" title="아래로" aria-label="아래로" ${i === b.units.length - 1 ? 'disabled' : ''}>${ic('down', 'sm')}</button>
        </span>
        ${ic('chevR')}
      </div>`;
    });
    h += `</div>`;
  }
  $main.innerHTML = h;
  $main.querySelector('#bookAddUnit').onclick = () => addUnit(b.id);
  const ea = $main.querySelector('#emptyAdd'); if (ea) ea.onclick = () => addUnit(b.id);
  $main.querySelector('#bookTest').onclick = () => openTest(b.id, null);
  $main.querySelector('#renameBook').onclick = async () => {
    const n = await modal({ title: '교재 이름 변경', input: { value: b.name }, ok: '변경' });
    if (!n) return;
    const old = b.name; b.name = n;
    if (!(await saveBook(b))) b.name = old;
    render();
  };
  $main.querySelector('#delBook').onclick = async () => {
    const ok = await modal({ title: `‘${esc(b.name)}’ 교재를 삭제할까요?`, desc: `단원 ${b.units.length}개와 단어가 모두 지워지고, 되돌릴 수 없어요.`, ok: '삭제', danger: true });
    if (!ok) return;
    const done = await persist(() => batchAll([...b.units.map(u => delW('units', u.id)), delW('books', b.id)]), '교재를 삭제했어요');
    if (done) { db.books = db.books.filter(x => x !== b); go('home', { bookId: null }); }
  };
  $main.querySelectorAll('.list-row').forEach(el => el.onclick = () => go('unit', { unitId: el.dataset.u }));
  const move = async (e, i, d) => {
    e.stopPropagation();
    const j = i + d; if (j < 0 || j >= b.units.length) return;
    [b.units[i], b.units[j]] = [b.units[j], b.units[i]];
    b.units.forEach((u, k) => { u.order = k; });
    render();
    await persist(() => batchAll(b.units.map(u => setW('units', u.id, unitData(b, u)))));
  };
  $main.querySelectorAll('[data-up]').forEach(el => el.onclick = e => move(e, +el.dataset.up, -1));
  $main.querySelectorAll('[data-down]').forEach(el => el.onclick = e => move(e, +el.dataset.down, 1));
}

/* ================= unit editor ================= */
const SAMPLE = '01 policy 정책 employee 종업원 gain 얻다\n02 gestural 몸짓의 nod 고개를 끄덕이다';

function renderUnit() {
  const b = book(ui.bookId), u = unit(b, ui.unitId);
  if (!u) return go('book');
  $main.innerHTML = crumb([{ t: '단어장', go: 'data-go="home"' }, { t: b.name, go: 'id="toBook"' }, { t: u.name }]) + `
    <div class="page-head">
      <div class="titles">
        <input type="text" class="unit-title" id="unitName" value="${esc(u.name)}" aria-label="단원 이름">
        <div class="page-sub" style="padding-left:0"><span class="save-state" id="saveState"><span class="dot"></span><span>저장됨</span></span></div>
      </div>
      <div class="actions">
        <button class="btn icon" id="delUnit" title="단원 삭제" aria-label="단원 삭제">${ic('trash')}</button>
        <button class="btn" id="listPdf">${ic('download')}단어장 PDF</button>
        <button class="btn primary" id="unitTest">${ic('sheet')}시험지 만들기</button>
      </div>
    </div>
    <div class="editor-grid">
      <div class="card">
        <div class="card-title">단어 입력</div>
        <textarea id="raw" spellcheck="false" placeholder="${esc(SAMPLE)}">${esc(u.raw)}</textarea>
        <div class="hint">
          <div class="hint-item"><span class="n">1</span><span><b>문제 번호 → 영어 → 뜻</b> 순서로 입력하면 오른쪽 표가 바로 채워져요.</span></div>
          <div class="hint-item"><span class="n">2</span><span><code>01</code> <code>2</code> <code>3.</code>처럼 숫자가 나오면 새 문제예요. 문제마다 단어 수는 자유예요.</span></div>
          <div class="hint-item"><span class="n">3</span><span><code>give up</code>, <code>고개를 끄덕이다</code>처럼 띄어 쓴 표현도 하나로 묶여요.</span></div>
          ${u.raw ? '' : `<div class="example" id="useSample"><span class="lbl">예시 넣어보기</span>${esc(SAMPLE).replace('\n', '<br>')}</div>`}
        </div>
      </div>
      <div class="card sticky">
        <div class="card-title">미리보기 <span class="row" style="margin-left:auto;gap:6px" id="pvStats"></span></div>
        <div id="preview"></div>
      </div>
    </div>`;

  const $raw = $main.querySelector('#raw');
  const $state = $main.querySelector('#saveState');
  let timer = null;
  const setState = (txt, saving) => { $state.classList.toggle('saving', !!saving); $state.lastChild.textContent = txt; };

  const update = () => {
    const qs = parse($raw.value);
    const nw = qs.reduce((s, q) => s + q.words.length, 0);
    $main.querySelector('#pvStats').innerHTML = qs.length ? `<span class="pill">문제 ${qs.length}</span><span class="pill blue">단어 ${nw}</span>` : '';
    $main.querySelector('#preview').innerHTML = qs.length ? wordTableHTML(qs)
      : `<div class="preview-empty"><span class="tile md" style="--c:#8b95a1">${ic('doc')}</span>왼쪽에 단어를 입력하면<br>여기에 표가 만들어져요.</div>`;
    return qs;
  };
  update();

  const flushUnit = async () => {
    clearTimeout(timer); timer = null;
    pendingFlush = null;
    if (u.raw === $raw.value) return true;
    u.raw = $raw.value; u.questions = parse(u.raw); u.updatedAt = Date.now();
    const ok = await saveUnit(b, u);
    if ($state.isConnected) setState(ok ? '저장됨' : '저장 실패 · 다시 입력하면 재시도해요', !ok);
    return ok;
  };
  const onInput = () => {
    update();
    setState('저장 중…', true);
    clearTimeout(timer);
    pendingFlush = flushUnit;
    timer = setTimeout(async () => { await flushUnit(); renderSidebar(); }, 800);
  };
  $raw.addEventListener('input', onInput);
  const sample = $main.querySelector('#useSample');
  if (sample) sample.onclick = () => { $raw.value = SAMPLE; sample.remove(); onInput(); $raw.focus(); };

  $main.querySelector('#unitName').addEventListener('change', async e => {
    const n = e.target.value.trim(); if (!n) { e.target.value = u.name; return; }
    u.name = n; renderSidebar();
    await saveUnit(b, u);
  });
  $main.querySelector('#unitName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $main.querySelector('#toBook').onclick = () => go('book', { unitId: null });
  $main.querySelector('#delUnit').onclick = async () => {
    const ok = await modal({ title: `‘${esc(u.name)}’ 단원을 삭제할까요?`, desc: `단어 ${wordCount(u)}개가 지워지고, 되돌릴 수 없어요.`, ok: '삭제', danger: true });
    if (!ok) return;
    clearTimeout(timer); pendingFlush = null;
    if (await persist(() => deleteDoc(doc(fs, 'units', u.id)), '단원을 삭제했어요')) {
      b.units = b.units.filter(x => x !== u); go('book', { unitId: null });
    }
  };
  $main.querySelector('#unitTest').onclick = async () => { await flushUnit(); openTest(b.id, [u.id]); };
  $main.querySelector('#listPdf').onclick = async () => {
    await flushUnit();
    if (!u.questions.length) return toast('단어를 먼저 입력해 주세요');
    const rows = buildRows([u], 'list', false);
    exportPDF(sheetHTML({ kind: 'list', title: `${u.name} 단어장`, sub: b.name, rows }), `${b.name}_${u.name}_단어장`);
  };
}

function wordTableHTML(qs) {
  let h = `<div class="table-wrap"><table class="words"><thead><tr><th>문제</th><th>#</th><th>영어</th><th>뜻</th></tr></thead><tbody>`;
  let n = 0;
  for (const q of qs) {
    q.words.forEach((w, i) => {
      n++;
      h += `<tr class="${i === 0 ? 'qstart' : ''}"><td class="q">${i === 0 ? `<span>${esc(q.no)}</span>` : ''}</td><td class="n">${n}</td>
        <td class="${w.en ? 'en' : 'warn'}">${w.en ? esc(w.en) : '영어를 입력해 주세요'}</td>
        <td class="${w.ko ? 'ko' : 'warn'}">${w.ko ? esc(w.ko) : '뜻을 입력해 주세요'}</td></tr>`;
    });
  }
  return h + `</tbody></table></div>`;
}

/* ================= test maker ================= */
function openTest(bookId, unitIds) {
  const t = ui.test;
  const b = book(bookId) || book(t.bookId) || db.books[0];
  if (b && b.id !== t.bookId) t.unitIds = [];
  t.bookId = b ? b.id : null;
  if (unitIds) t.unitIds = unitIds;
  t.rows = null; t.title = '';
  go('test', bookId ? { bookId } : {});
}

function renderTest() {
  const t = ui.test;
  if (!db.books.length) {
    $main.innerHTML = `<div class="hero"><h1>시험지 만들기</h1></div>
      <div class="list"><div class="empty"><b>먼저 단어장이 필요해요</b><button class="btn primary" id="tGoAdd">${ic('plus')}교재 만들기</button></div></div>`;
    $main.querySelector('#tGoAdd').onclick = addBook;
    return;
  }
  let b = book(t.bookId);
  if (!b) { b = db.books[0]; t.bookId = b.id; t.unitIds = []; }
  t.unitIds = t.unitIds.filter(id => unit(b, id));
  const units = b.units.filter(u => t.unitIds.includes(u.id));
  const total = units.reduce((s, u) => s + wordCount(u), 0);
  const pick = () => (t.count ? Math.min(t.count, total) : total);
  const presets = [10, 20, 30, 50].filter(n => n < total);
  const defTitle = units.length ? `${units.map(u => u.name).join(', ')} 단어 시험` : '단어 시험';
  const allOn = b.units.length && units.length === b.units.length;

  const modes = [
    ['en', '영어 쓰기', '뜻을 보고 영어를 써요', ['', '뜻']],
    ['ko', '뜻 쓰기', '영어를 보고 뜻을 써요', ['word', '']],
    ['mix', '반반 섞기', '빈칸이 무작위로 절반씩', ['word', '', '', '뜻']],
  ];
  const demo = cells => cells.map(c => `<i class="${c ? '' : 'b'}">${c || '·'}</i>`).join('');

  $main.innerHTML = `
    <div class="hero"><h1>시험지 만들기</h1></div>
    <div class="card">
      <div class="step">
        <div class="step-head"><span class="num">1</span><h3>교재</h3></div>
        <select id="tBook" style="max-width:420px">${db.books.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      </div>
      <div class="step">
        <div class="step-head"><span class="num">2</span><h3>단원</h3><span class="muted" style="font-size:14px">여러 개 고를 수 있어요</span>
          ${b.units.length ? `<button class="btn sm ghost aside" id="tAll">${allOn ? '전체 해제' : '전체 선택'}</button>` : ''}</div>
        ${b.units.length ? `<div class="unit-pick">${b.units.map(u => `
          <label class="check"><input type="checkbox" value="${u.id}" ${t.unitIds.includes(u.id) ? 'checked' : ''}>
          <span class="box">${ic('check')}</span><span class="name">${esc(u.name)}</span><span class="count">${wordCount(u)}</span></label>`).join('')}</div>`
          : `<p class="muted" style="margin:0">이 교재에는 아직 단원이 없어요.</p>`}
      </div>
      <div class="step">
        <div class="step-head"><span class="num">3</span><h3>출제 방식</h3></div>
        <div class="mode-pick">
          ${modes.map(([v, l, d, cells]) => `<label class="mode"><input type="radio" name="mode" value="${v}" ${t.mode === v ? 'checked' : ''}>
            <span class="radio"></span><div class="demo">${v === 'mix' ? `<div style="display:flex;flex-direction:column;gap:4px;flex:1"><div style="display:flex;gap:6px">${demo(cells.slice(0, 2))}</div><div style="display:flex;gap:6px">${demo(cells.slice(2))}</div></div>` : demo(cells)}</div>
            <b>${l}</b><small>${d}</small></label>`).join('')}
        </div>
      </div>
      <div class="step">
        <div class="step-head"><span class="num">4</span><h3>단어 수</h3>${total ? `<span class="muted" style="font-size:14px">고른 단원에 단어 ${total}개</span>` : ''}</div>
        <div class="row" style="gap:10px">
          <div class="seg" id="tCountSeg">
            <button data-count="" class="${!t.count || t.count >= total ? 'on' : ''}" ${total ? '' : 'disabled'}>전체</button>
            ${presets.map(n => `<button data-count="${n}" class="${t.count === n ? 'on' : ''}">${n}</button>`).join('')}
          </div>
          <span class="row" style="gap:6px"><input type="number" class="input" id="tCount" min="1" max="${total || 1}" value="${total ? pick() : ''}" ${total ? '' : 'disabled'} style="width:96px;text-align:center" aria-label="단어 수 직접 입력"><span class="muted">개</span></span>
        </div>
        <p class="muted" style="font-size:13.5px;margin:10px 0 0">전체보다 적게 고르면 그만큼 무작위로 뽑아요.</p>
      </div>
      <div class="step">
        <div class="step-head"><span class="num">5</span><h3>제목과 옵션</h3></div>
        <input type="text" id="tTitle" style="max-width:520px;margin-bottom:10px" value="${esc(t.title || defTitle)}" placeholder="${esc(defTitle)}" aria-label="시험지 제목">
        <label class="switch-row" style="max-width:520px">
          <span class="txt"><b>단어 순서 섞기</b><small>문제 번호 구분 없이 무작위 순서로 출제해요</small></span>
          <span class="switch"><input type="checkbox" id="tShuffle" ${t.shuffle ? 'checked' : ''}><span></span></span>
        </label>
      </div>
      <div class="cta-bar">
        <button class="btn primary xl" id="tMake" ${total ? '' : 'disabled'}>${total ? `${pick()}단어로 시험지 만들기` : '단원을 골라 주세요'}</button>
      </div>
    </div>
    <div id="tResult"></div>`;

  const reset = () => { t.rows = null; t.title = ''; };
  $main.querySelector('#tBook').onchange = e => { t.bookId = e.target.value; t.unitIds = []; reset(); renderTest(); };
  $main.querySelectorAll('.unit-pick input').forEach(el => el.onchange = () => {
    t.unitIds = [...$main.querySelectorAll('.unit-pick input:checked')].map(x => x.value);
    reset(); renderTest();
  });
  const all = $main.querySelector('#tAll');
  if (all) all.onclick = () => { t.unitIds = allOn ? [] : b.units.map(u => u.id); reset(); renderTest(); };
  $main.querySelectorAll('input[name=mode]').forEach(el => el.onchange = () => { t.mode = el.value; if (t.rows) make(false); });
  $main.querySelector('#tShuffle').onchange = e => { t.shuffle = e.target.checked; if (t.rows) make(false); };
  $main.querySelector('#tTitle').oninput = e => { t.title = e.target.value; if (t.rows) showResult(); };
  $main.querySelector('#tMake').onclick = () => make(true);

  const setCount = (n, remake) => {
    t.count = !n || n >= total ? null : Math.max(1, Math.floor(n));
    $main.querySelectorAll('#tCountSeg button').forEach(x => x.classList.toggle('on', (+x.dataset.count || null) === t.count));
    if (total) $main.querySelector('#tMake').textContent = `${pick()}단어로 시험지 만들기`;
    if (remake && t.rows) make(false);
  };
  $main.querySelectorAll('#tCountSeg button').forEach(el => el.onclick = () => {
    setCount(+el.dataset.count || null, true);
    $main.querySelector('#tCount').value = pick();
  });
  const $cnt = $main.querySelector('#tCount');
  $cnt.oninput = () => { const v = parseInt($cnt.value, 10); if (v > 0) setCount(v, false); };
  $cnt.onchange = () => {
    const v = parseInt($cnt.value, 10);
    setCount(v > 0 ? v : null, true);
    $cnt.value = pick();
  };

  function make(scroll) {
    if (!units.length) return;
    t.rows = buildRows(units, t.mode, t.shuffle, t.count);
    showResult();
    if (scroll) $main.querySelector('#tResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function showResult() {
    const title = (t.title || defTitle).trim();
    const sub = `${b.name} · ${units.map(u => u.name).join(', ')}`;
    const sheet = kind => sheetHTML({ kind, title, sub, rows: t.rows, mode: t.mode });
    const r = $main.querySelector('#tResult');
    r.innerHTML = `
      <div class="card" style="scroll-margin-top:80px">
        <div class="result-head">
          <div class="seg" role="tablist"><button data-show="test" class="${t.show === 'test' ? 'on' : ''}">시험지</button><button data-show="answer" class="${t.show === 'answer' ? 'on' : ''}">답안지</button></div>
          ${t.mode === 'mix' || t.shuffle || pick() < total ? `<button class="btn ghost sm" id="tRe">${ic('shuffle', 'sm')}다시 섞기</button>` : ''}
          <span class="spacer"></span>
          <button class="btn icon" id="tPrint" title="인쇄" aria-label="인쇄">${ic('print')}</button>
          <button class="btn" id="tAnsPdf">답안지 PDF</button>
          <button class="btn primary" id="tPdf">${ic('download')}시험지 PDF</button>
        </div>
        <div class="paper-wrap"><div class="paper">${sheet(t.show)}</div></div>
      </div>`;
    r.querySelectorAll('[data-show]').forEach(el => el.onclick = () => { t.show = el.dataset.show; showResult(); });
    const re = r.querySelector('#tRe'); if (re) re.onclick = () => { make(false); toast('새로 섞었어요'); };
    const fname = title.replace(/[\\/:*?"<>|]/g, '_');
    r.querySelector('#tPdf').onclick = () => exportPDF(sheet('test'), fname);
    r.querySelector('#tAnsPdf').onclick = () => exportPDF(sheet('answer'), fname + '_답안');
    r.querySelector('#tPrint').onclick = () => { $stage.innerHTML = sheet(t.show); window.print(); };
  }
  if (t.rows) showResult();
}

const shuffleArr = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* rows: { type:'section', name } | { type:'word', qno, qstart, en, ko, blank:'en'|'ko'|null } */
function buildRows(units, mode, shuffle, count = null) {
  let words = [];
  for (const u of units) {
    for (const q of u.questions) {
      q.words.forEach((w, i) => words.push({ type: 'word', unit: u.name, qno: q.no, qstart: i === 0, en: w.en, ko: w.ko }));
    }
  }
  // 단어 수를 정했으면 무작위로 뽑되, 원래 순서는 유지
  if (count && count < words.length) {
    const keep = new Set(shuffleArr(words.map((_, i) => i)).slice(0, count));
    let last = null;
    words = words.filter((_, i) => keep.has(i)).map(w => {
      const key = w.unit + '|' + w.qno;
      const qstart = key !== last; last = key;
      return { ...w, qstart };
    });
  }
  if (mode === 'list') return words.map(w => ({ ...w, blank: null })).flatMap(sectionize(units.length > 1));

  let blanks;
  if (mode === 'mix') {
    const half = Math.floor(words.length / 2) + (Math.random() < .5 ? words.length % 2 : 0);
    blanks = shuffleArr(words.map((_, i) => (i < half ? 'en' : 'ko')));
  } else blanks = words.map(() => mode);
  words = words.map((w, i) => ({ ...w, blank: blanks[i] }));

  if (shuffle) return shuffleArr(words).map(w => ({ ...w, qno: '', qstart: false }));
  return words.flatMap(sectionize(units.length > 1));
}
function sectionize(multi) {
  let last = null;
  return w => {
    if (multi && w.unit !== last) { last = w.unit; return [{ type: 'section', name: w.unit }, w]; }
    return [w];
  };
}

/* ================= printable sheet ================= */
function sheetHTML({ kind, title, sub, rows, mode }) {
  const showQ = rows.some(r => r.type === 'word' && r.qno);
  const isTest = kind === 'test' || kind === 'answer';
  const total = rows.filter(r => r.type === 'word').length;
  const guide = { en: '우리말 뜻을 보고 알맞은 영어 단어를 쓰세요.', ko: '영어 단어를 보고 알맞은 우리말 뜻을 쓰세요.', mix: '빈칸에 알맞은 영어 단어 또는 우리말 뜻을 쓰세요.' }[mode] || '';
  const cols = showQ ? 4 : 3;
  let h = `<div class="sheet">
    <div class="s-head">
      <div class="s-brand"><span class="s-mark">L</span><div class="s-logo">LUMOS<small>English Academy</small></div></div>
      <div class="s-title"><b>${esc(title)}${kind === 'answer' ? ' · 정답' : ''}</b><span>${esc(sub)}</span></div>
    </div>`;
  if (isTest) {
    h += `<div class="s-info"><div>이름<em></em></div><div>날짜<em></em></div><div>점수<em>/ ${total}</em></div></div>
      <div class="s-guide">${guide}</div>`;
  }
  h += `<table><colgroup>${showQ ? '<col class="c-q">' : ''}<col class="c-n"><col><col></colgroup>
    <thead><tr>${showQ ? '<th class="c">문제</th>' : ''}<th class="c">No.</th><th>English</th><th>뜻</th></tr></thead><tbody>`;
  let n = 0;
  for (const r of rows) {
    if (r.type === 'section') { h += `<tr class="section"><td colspan="${cols}">${esc(r.name)}</td></tr>`; continue; }
    n++;
    const cell = side => {
      const val = side === 'en' ? r.en : r.ko;
      const cls = side === 'en' ? 'en' : '';
      if (r.blank !== side) return `<td class="${cls}">${esc(val)}</td>`;
      return kind === 'answer' ? `<td class="ans">${esc(val)}</td>` : `<td class="blank"></td>`;
    };
    h += `<tr class="${r.qstart ? 'qstart' : ''}">${showQ ? `<td class="q">${r.qstart ? esc(r.qno) : ''}</td>` : ''}<td class="n">${n}</td>${cell('en')}${cell('ko')}</tr>`;
  }
  h += `</tbody></table><div class="s-foot"><span>LUMOS English Academy</span><span>${isTest ? `총 ${total}문항` : `단어 ${total}개`}</span></div></div>`;
  return h;
}

/* ================= PDF (A4) ================= */
async function exportPDF(html, filename) {
  if (typeof html2pdf === 'undefined') {
    toast('PDF 기능을 불러오지 못했어요. 인쇄 창에서 PDF로 저장해 주세요');
    $stage.innerHTML = html; window.print(); return;
  }
  toast('PDF를 만들고 있어요', true);
  $stage.innerHTML = html;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const blob = await html2pdf().set({
      margin: [12, 12, 12, 12],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.s-head', '.s-info'] },
    }).from($stage.firstElementChild).outputPdf('blob');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('PDF를 저장했어요');
  } catch (e) {
    console.error(e);
    toast('PDF를 만들지 못했어요. 다시 시도해 주세요');
  } finally {
    $stage.innerHTML = '';
  }
}

/* ================= backup ================= */
function renderBackup() {
  const nu = db.books.reduce((s, b) => s + b.units.length, 0);
  $main.innerHTML = `
    <div class="hero"><h1>백업</h1></div>
    <div class="notice">${ic('info')}<span>단어장은 온라인에 저장돼서 어느 컴퓨터에서든 로그인하면 같은 내용이 보여요. 만약을 위해 가끔 백업 파일을 받아 두세요.</span></div>
    <div class="backup-grid">
      <div class="card">
        <span class="tile md" style="--c:#3182f6">${ic('download')}</span>
        <div class="card-title" style="margin-bottom:6px">백업 파일 받기</div>
        <p>교재 ${db.books.length}권 · 단원 ${nu}개를 파일 하나로 저장해요.</p>
        <button class="btn primary" id="bkDown" ${db.books.length ? '' : 'disabled'}>백업 파일 받기</button>
      </div>
      <div class="card">
        <span class="tile md" style="--c:#00b493">${ic('upload')}</span>
        <div class="card-title" style="margin-bottom:6px">백업 파일 불러오기</div>
        <p>불러오면 온라인 단어장 전체가 백업 파일 내용으로 바뀌어요. 다른 선생님 화면에도 똑같이 적용돼요.</p>
        <button class="btn" id="bkPick">파일 선택</button>
        <input type="file" id="bkFile" accept="application/json,.json" hidden>
      </div>
    </div>`;
  $main.querySelector('#bkDown').onclick = () => {
    const out = { books: db.books.map(b => ({ id: b.id, name: b.name, order: b.order, units: b.units.map(u => ({ id: u.id, name: u.name, order: u.order, raw: u.raw, updatedAt: u.updatedAt })) })) };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lumos-단어장-백업-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('백업 파일을 받았어요');
  };
  const $file = $main.querySelector('#bkFile');
  $main.querySelector('#bkPick').onclick = () => $file.click();
  $file.onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.books)) throw new Error('형식 오류');
      const ok = await modal({ title: '백업 파일을 불러올까요?', desc: `교재 ${d.books.length}권을 불러와요. 지금 온라인 단어장은 이 내용으로 바뀌어요.`, ok: '불러오기', danger: true });
      if (!ok) return;
      const next = d.books.map((b, i) => ({
        id: b.id || uid(), name: b.name || '이름 없는 교재', order: b.order ?? i,
        units: (b.units || []).map((u, j) => ({ id: u.id || uid(), name: u.name || `Unit ${j + 1}`, order: u.order ?? j, raw: u.raw || '', updatedAt: u.updatedAt || Date.now(), questions: parse(u.raw || '') })),
      }));
      const keepBooks = new Set(next.map(b => b.id));
      const keepUnits = new Set(next.flatMap(b => b.units.map(u => u.id)));
      const deletes = [
        ...db.books.flatMap(b => b.units).filter(u => !keepUnits.has(u.id)).map(u => delW('units', u.id)),
        ...db.books.filter(b => !keepBooks.has(b.id)).map(b => delW('books', b.id)),
      ];
      toast('불러오는 중', true);
      if (await persist(() => batchAll([...writesFor(next), ...deletes]), '불러오기를 마쳤어요')) {
        db = { books: next.sort(byOrder) };
        go('home', { bookId: null, unitId: null });
      }
    } catch (err) { toast('올바른 백업 파일이 아니에요'); }
    finally { $file.value = ''; }
  };
}

/* ================= toast ================= */
let toastTimer;
function toast(msg, loading = false) {
  const el = document.getElementById('toast');
  el.innerHTML = (loading ? '<span class="spin"></span>' : '') + esc(msg);
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (!loading) toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ================= sync ================= */
// 다른 선생님이 고친 내용을 탭으로 돌아올 때 다시 불러오기 (단원 편집 중에는 건너뜀)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !user || pendingFlush || ui.view === 'unit' || $modal.innerHTML) return;
  try { await loadAll(); render(); } catch (e) { /* 다음 기회에 */ }
});
window.addEventListener('beforeunload', e => { if (pendingFlush) { pendingFlush(); e.preventDefault(); } });

/* ================= boot ================= */
$main.innerHTML = `<div class="loading"><span class="spin"></span></div>`;
onAuthStateChanged(auth, async u => {
  user = u;
  if (!u) { db = { books: [] }; return renderLogin(); }
  $main.innerHTML = `<div class="loading"><span class="spin"></span></div>`;
  try {
    await loadAll();
  } catch (e) {
    console.error(e);
    $main.innerHTML = `<div class="card login"><h1>단어장을 불러오지 못했어요</h1><p class="muted">${esc(errorText(e, '잠시 후 다시 시도해 주세요'))}</p><button class="btn primary" onclick="location.reload()">다시 시도</button></div>`;
    return;
  }
  render();
});
