/* LUMOS 단어장 · 단어시험지 */
'use strict';

const STORE_KEY = 'lumos-vocab-v1';
const $main = document.getElementById('main');
const $side = document.getElementById('sidebar');
const $stage = document.getElementById('pdf-stage');

/* ================= data ================= */
let db = load();
const ui = {
  view: 'home',          // home | book | unit | test | backup
  bookId: null,
  unitId: null,
  open: {},              // sidebar: expanded books
  test: { bookId: null, unitIds: [], mode: 'en', shuffle: false, title: '', rows: null, show: 'test' },
};

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && Array.isArray(d.books)) return d;
  } catch (e) { /* ignore */ }
  return { books: [] };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('저장 실패: 브라우저 저장공간을 확인하세요'); return false; }
}
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const book = id => db.books.find(b => b.id === id);
const unit = (b, id) => b && b.units.find(u => u.id === id);
const wordCount = u => u.questions.reduce((s, q) => s + q.words.length, 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= parser =================
 * "01 policy 정책 employee 종업원 gain 얻다 02 gestural 몸짓의 nod 고개를 끄덕이다"
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
  const ensureQ = () => {
    if (!cur) {
      const n = questions.length + 1;
      cur = { no: String(n).padStart(2, '0'), words: [] };
      questions.push(cur);
    }
  };
  const flush = () => {
    if (en.length || ko.length) {
      ensureQ();
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

/* ================= navigation ================= */
function go(view, opts = {}) {
  Object.assign(ui, { view }, opts);
  if (ui.bookId) ui.open[ui.bookId] = true;
  render();
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) {
    const v = g.dataset.go;
    if (v === 'test') openTest(ui.bookId, ui.unitId ? [ui.unitId] : null);
    else go(v, v === 'home' ? { bookId: null, unitId: null } : {});
  }
});

function render() {
  document.querySelectorAll('.tab').forEach(t => {
    const v = t.dataset.go;
    t.classList.toggle('active', v === ui.view || (v === 'home' && ['home', 'book', 'unit'].includes(ui.view)));
  });
  renderSidebar();
  ({ home: renderHome, book: renderBook, unit: renderUnit, test: renderTest, backup: renderBackup }[ui.view] || renderHome)();
}

/* ================= sidebar ================= */
function renderSidebar() {
  let h = `<div class="side-head"><h3>교재</h3><button class="btn sm primary" id="addBook">+ 교재</button></div>`;
  if (!db.books.length) {
    h += `<div class="empty-side">아직 교재가 없어요.<br>“+ 교재”로 교재 폴더를 만들어 주세요.</div>`;
  }
  for (const b of db.books) {
    const open = ui.open[b.id];
    const act = ui.bookId === b.id && ui.view === 'book';
    h += `<div class="book">
      <div class="book-row ${act ? 'active' : ''}" data-book="${b.id}">
        <span class="ico" data-toggle="${b.id}">${open ? '▾' : '▸'}</span>
        <span class="name">📁 ${esc(b.name)}</span>
        <span class="count">${b.units.length}</span>
      </div>`;
    if (open) {
      h += `<div class="units">`;
      for (const u of b.units) {
        const a = ui.unitId === u.id && ui.view === 'unit';
        h += `<div class="unit-row ${a ? 'active' : ''}" data-book="${b.id}" data-unit="${u.id}">
          <span class="name">${esc(u.name)}</span><span class="count">${wordCount(u)}</span></div>`;
      }
      h += `<div class="add-unit" data-addunit="${b.id}">+ 단원 추가</div></div>`;
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

function addBook() {
  const name = prompt('교재 이름을 입력하세요 (예: 능률 VOCA 고교필수)');
  if (!name || !name.trim()) return;
  const b = { id: uid(), name: name.trim(), units: [] };
  db.books.push(b); save();
  go('book', { bookId: b.id, unitId: null });
}
function addUnit(bookId) {
  const b = book(bookId);
  const name = prompt('단원 이름을 입력하세요 (예: Day 01, Unit 3)', `Unit ${b.units.length + 1}`);
  if (!name || !name.trim()) return;
  const u = { id: uid(), name: name.trim(), raw: '', questions: [], updatedAt: Date.now() };
  b.units.push(u); save();
  go('unit', { bookId, unitId: u.id });
}

/* ================= home ================= */
function renderHome() {
  if (!db.books.length) {
    $main.innerHTML = `<div class="card welcome">
      <div class="big">📚</div>
      <h1 class="page">LUMOS 단어장에 오신 걸 환영해요</h1>
      <p class="muted">교재 폴더 → 단원 → 단어 입력 순서로 단어장을 만들고,<br>만든 단어장으로 A4 단어시험지를 PDF로 뽑을 수 있어요.</p>
      <button class="btn gold" id="w-add">+ 첫 교재 만들기</button></div>`;
    $main.querySelector('#w-add').onclick = addBook;
    return;
  }
  let h = `<h1 class="page">단어장 목록</h1><div class="crumb">교재 ${db.books.length}개 · 단원 ${db.books.reduce((s, b) => s + b.units.length, 0)}개</div><div class="book-grid">`;
  for (const b of db.books) {
    h += `<div class="card book-card"><div class="title">📁 <span style="flex:1">${esc(b.name)}</span>
      <button class="btn sm" data-open-book="${b.id}">열기</button></div><ul>`;
    if (!b.units.length) h += `<li class="muted" style="cursor:default">단원이 없어요</li>`;
    for (const u of b.units) {
      h += `<li data-b="${b.id}" data-u="${u.id}"><span>${esc(u.name)}</span><span class="count">문제 ${u.questions.length} · 단어 ${wordCount(u)}</span></li>`;
    }
    h += `</ul></div>`;
  }
  $main.innerHTML = h + `</div>`;
  $main.querySelectorAll('[data-open-book]').forEach(el => el.onclick = () => go('book', { bookId: el.dataset.openBook, unitId: null }));
  $main.querySelectorAll('li[data-u]').forEach(el => el.onclick = () => go('unit', { bookId: el.dataset.b, unitId: el.dataset.u }));
}

/* ================= book ================= */
function renderBook() {
  const b = book(ui.bookId);
  if (!b) return go('home');
  let h = `<div class="crumb"><a data-go="home">단어장 목록</a> › ${esc(b.name)}</div>
    <div class="row" style="margin-bottom:18px">
      <h1 class="page" style="margin:0">📁 ${esc(b.name)}</h1><span class="spacer"></span>
      <button class="btn" id="renameBook">이름 변경</button>
      <button class="btn danger" id="delBook">교재 삭제</button>
      <button class="btn gold" id="bookTest">시험지 만들기</button>
      <button class="btn primary" id="bookAddUnit">+ 단원 추가</button>
    </div><div class="card">`;
  if (!b.units.length) {
    h += `<p class="muted">아직 단원이 없어요. “+ 단원 추가”를 눌러 시작하세요.</p>`;
  } else {
    h += `<table class="words"><thead><tr><th>단원</th><th>문제 수</th><th>단어 수</th><th>수정일</th><th></th></tr></thead><tbody>`;
    b.units.forEach((u, i) => {
      h += `<tr><td><a style="cursor:pointer;font-weight:700;color:var(--navy)" data-u="${u.id}">${esc(u.name)}</a></td>
        <td>${u.questions.length}</td><td>${wordCount(u)}</td>
        <td class="muted">${new Date(u.updatedAt).toLocaleDateString('ko-KR')}</td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn icon" data-up="${i}" title="위로">▲</button>
          <button class="btn icon" data-down="${i}" title="아래로">▼</button>
        </td></tr>`;
    });
    h += `</tbody></table>`;
  }
  $main.innerHTML = h + `</div>`;
  $main.querySelector('#bookAddUnit').onclick = () => addUnit(b.id);
  $main.querySelector('#bookTest').onclick = () => openTest(b.id, null);
  $main.querySelector('#renameBook').onclick = () => {
    const n = prompt('새 교재 이름', b.name);
    if (n && n.trim()) { b.name = n.trim(); save(); render(); }
  };
  $main.querySelector('#delBook').onclick = () => {
    if (confirm(`“${b.name}” 교재와 단원 ${b.units.length}개를 모두 삭제할까요?`)) {
      db.books = db.books.filter(x => x !== b); save(); go('home', { bookId: null });
    }
  };
  $main.querySelectorAll('[data-u]').forEach(el => el.onclick = () => go('unit', { unitId: el.dataset.u }));
  const move = (i, d) => {
    const j = i + d; if (j < 0 || j >= b.units.length) return;
    [b.units[i], b.units[j]] = [b.units[j], b.units[i]]; save(); render();
  };
  $main.querySelectorAll('[data-up]').forEach(el => el.onclick = () => move(+el.dataset.up, -1));
  $main.querySelectorAll('[data-down]').forEach(el => el.onclick = () => move(+el.dataset.down, 1));
}

/* ================= unit editor ================= */
function renderUnit() {
  const b = book(ui.bookId), u = unit(b, ui.unitId);
  if (!u) return go('book');
  $main.innerHTML = `
    <div class="crumb"><a data-go="home">단어장 목록</a> › <a id="toBook">${esc(b.name)}</a> › ${esc(u.name)}</div>
    <div class="row" style="margin-bottom:18px">
      <input type="text" class="unit-title" id="unitName" value="${esc(u.name)}">
      <span class="save-state" id="saveState">저장됨</span>
      <button class="btn danger" id="delUnit">단원 삭제</button>
      <button class="btn" id="listPdf">단어장 PDF</button>
      <button class="btn gold" id="unitTest">이 단원으로 시험지 만들기</button>
    </div>
    <div class="editor-grid">
      <div class="card">
        <h2>단어 입력</h2>
        <textarea id="raw" spellcheck="false" placeholder="01 policy 정책 employee 종업원 gain 얻다&#10;02 gestural 몸짓의 nod 고개를 끄덕이다">${esc(u.raw)}</textarea>
        <p class="hint">
          <b>문제 번호 → 영어 → 뜻</b> 순서로 입력하면 오른쪽 표가 자동으로 채워져요.<br>
          · 숫자(<code>01</code>, <code>2</code>, <code>3.</code>)가 나오면 새 문제가 시작돼요. 문제당 단어 개수는 자유예요.<br>
          · 띄어쓰기 있는 영어(<code>give up</code>)와 뜻(<code>고개를 끄덕이다</code>)도 그대로 묶여요.<br>
          · 줄바꿈은 상관없어요. 입력하면 자동으로 저장돼요.
        </p>
      </div>
      <div class="card">
        <h2 id="pvTitle">미리보기</h2>
        <div id="preview"></div>
      </div>
    </div>`;

  const $raw = $main.querySelector('#raw');
  const $state = $main.querySelector('#saveState');
  let timer = null;

  const update = () => {
    const qs = parse($raw.value);
    $main.querySelector('#pvTitle').textContent = `미리보기 · 문제 ${qs.length}개 · 단어 ${qs.reduce((s, q) => s + q.words.length, 0)}개`;
    $main.querySelector('#preview').innerHTML = qs.length ? wordTableHTML(qs) : `<p class="muted">왼쪽에 단어를 입력하면 여기에 표가 만들어져요.</p>`;
    return qs;
  };
  update();

  $raw.addEventListener('input', () => {
    const qs = update();
    $state.textContent = '저장 중…';
    clearTimeout(timer);
    timer = setTimeout(() => {
      u.raw = $raw.value; u.questions = qs; u.updatedAt = Date.now();
      if (save()) $state.textContent = '저장됨';
      renderSidebar();
    }, 400);
  });
  $main.querySelector('#unitName').addEventListener('change', e => {
    const n = e.target.value.trim(); if (!n) return;
    u.name = n; save(); renderSidebar();
  });
  $main.querySelector('#toBook').onclick = () => go('book', { unitId: null });
  $main.querySelector('#delUnit').onclick = () => {
    if (confirm(`“${u.name}” 단원을 삭제할까요?`)) {
      b.units = b.units.filter(x => x !== u); save(); go('book', { unitId: null });
    }
  };
  $main.querySelector('#unitTest').onclick = () => { flushUnit(); openTest(b.id, [u.id]); };
  $main.querySelector('#listPdf').onclick = () => {
    flushUnit();
    if (!u.questions.length) return toast('단어를 먼저 입력해 주세요');
    const rows = buildRows(b, [u], 'list', false);
    exportPDF(sheetHTML({ kind: 'list', title: `${u.name} 단어장`, sub: b.name, rows }), `${b.name}_${u.name}_단어장`);
  };

  function flushUnit() {
    clearTimeout(timer);
    u.raw = $raw.value; u.questions = parse($raw.value); u.updatedAt = Date.now(); save();
  }
}

function wordTableHTML(qs) {
  let h = `<table class="words"><thead><tr><th>문제</th><th>#</th><th>영어</th><th>뜻</th></tr></thead><tbody>`;
  let n = 0;
  for (const q of qs) {
    q.words.forEach((w, i) => {
      n++;
      h += `<tr class="${i === 0 ? 'qstart' : ''}"><td class="q">${i === 0 ? esc(q.no) : ''}</td><td class="n">${n}</td>
        <td class="${w.en ? '' : 'warn'}">${w.en ? esc(w.en) : '영어 없음'}</td>
        <td class="${w.ko ? '' : 'warn'}">${w.ko ? esc(w.ko) : '뜻 없음'}</td></tr>`;
    });
  }
  return h + `</tbody></table>`;
}

/* ================= test maker ================= */
function openTest(bookId, unitIds) {
  const t = ui.test;
  const b = book(bookId) || book(t.bookId) || db.books[0];
  t.bookId = b ? b.id : null;
  if (unitIds) t.unitIds = unitIds;
  else if (bookId && bookId !== t.unitBook) t.unitIds = [];
  t.unitBook = t.bookId;
  t.rows = null;
  go('test', bookId ? { bookId } : {});
}

function renderTest() {
  const t = ui.test;
  if (!db.books.length) {
    $main.innerHTML = `<h1 class="page">시험지 만들기</h1><div class="card"><p class="muted">먼저 교재와 단어장을 만들어 주세요.</p></div>`;
    return;
  }
  let b = book(t.bookId);
  if (!b) { b = db.books[0]; t.bookId = b.id; t.unitIds = []; }
  t.unitIds = t.unitIds.filter(id => unit(b, id));
  const units = b.units.filter(u => t.unitIds.includes(u.id));
  const total = units.reduce((s, u) => s + wordCount(u), 0);
  const defTitle = units.length ? `${units.map(u => u.name).join(', ')} 단어 시험` : '단어 시험';

  $main.innerHTML = `
    <h1 class="page">시험지 만들기</h1>
    <div class="crumb">단어장을 골라 출제 방식을 정하면 A4 시험지가 만들어져요.</div>
    <div class="card">
      <div class="field"><span class="label">1. 교재</span>
        <select id="tBook">${db.books.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><span class="label">2. 단원 <span class="muted" style="font-weight:400">(여러 개 선택 가능)</span>
        <button class="btn sm" id="tAll" style="margin-left:6px">${units.length === b.units.length && b.units.length ? '전체 해제' : '전체 선택'}</button></span>
        ${b.units.length ? `<div class="unit-pick">${b.units.map(u => `
          <label><input type="checkbox" value="${u.id}" ${t.unitIds.includes(u.id) ? 'checked' : ''}>
          <span style="flex:1">${esc(u.name)}</span><span class="count">${wordCount(u)}</span></label>`).join('')}</div>`
          : `<p class="muted">이 교재에 단원이 없어요.</p>`}
      </div>
      <div class="field"><span class="label">3. 출제 방식</span>
        <div class="mode-pick">
          ${[['en', '영어 쓰기', '한국어 뜻을 보고 영어 단어를 써요'],
             ['ko', '뜻 쓰기', '영어 단어를 보고 한국어 뜻을 써요'],
             ['mix', '반반 섞기', '영어/뜻 빈칸이 무작위로 절반씩']]
            .map(([v, l, d]) => `<label><input type="radio" name="mode" value="${v}" ${t.mode === v ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}
        </div>
      </div>
      <div class="field"><span class="label">4. 옵션</span>
        <label class="row" style="cursor:pointer"><input type="checkbox" id="tShuffle" ${t.shuffle ? 'checked' : ''}> 단어 순서 섞기 <span class="muted">(문제 번호 구분 없이 출제)</span></label>
      </div>
      <div class="field"><span class="label">5. 시험지 제목</span>
        <input type="text" id="tTitle" style="width:100%;max-width:520px" value="${esc(t.title || defTitle)}" placeholder="${esc(defTitle)}">
      </div>
      <div class="row">
        <button class="btn primary" id="tMake" ${total ? '' : 'disabled'}>시험지 만들기 (${total}단어)</button>
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
  if (all) all.onclick = () => {
    t.unitIds = units.length === b.units.length ? [] : b.units.map(u => u.id);
    reset(); renderTest();
  };
  $main.querySelectorAll('input[name=mode]').forEach(el => el.onchange = () => { t.mode = el.value; if (t.rows) make(); });
  $main.querySelector('#tShuffle').onchange = e => { t.shuffle = e.target.checked; if (t.rows) make(); };
  $main.querySelector('#tTitle').oninput = e => { t.title = e.target.value; if (t.rows) showResult(); };
  $main.querySelector('#tMake').onclick = make;

  function make() {
    if (!units.length) return;
    t.rows = buildRows(b, units, t.mode, t.shuffle);
    showResult();
  }
  function showResult() {
    const title = (t.title || defTitle).trim();
    const html = sheetHTML({ kind: t.show, title, sub: `${b.name} · ${units.map(u => u.name).join(', ')}`, rows: t.rows, mode: t.mode });
    const r = $main.querySelector('#tResult');
    r.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:14px">
          <div class="seg"><button data-show="test" class="${t.show === 'test' ? 'on' : ''}">시험지</button><button data-show="answer" class="${t.show === 'answer' ? 'on' : ''}">답안지</button></div>
          ${t.mode === 'mix' || t.shuffle ? `<button class="btn" id="tRe">🔀 다시 섞기</button>` : ''}
          <span class="spacer"></span>
          <button class="btn" id="tPrint">인쇄</button>
          <button class="btn" id="tAnsPdf">답안지 PDF</button>
          <button class="btn gold" id="tPdf">시험지 PDF 저장</button>
        </div>
        <div class="paper-wrap"><div class="paper">${html}</div></div>
      </div>`;
    r.querySelectorAll('[data-show]').forEach(el => el.onclick = () => { t.show = el.dataset.show; showResult(); });
    const re = r.querySelector('#tRe'); if (re) re.onclick = make;
    const fname = title.replace(/[\\/:*?"<>|]/g, '_');
    r.querySelector('#tPdf').onclick = () => exportPDF(sheetHTML({ kind: 'test', title, sub: `${b.name} · ${units.map(u => u.name).join(', ')}`, rows: t.rows, mode: t.mode }), fname);
    r.querySelector('#tAnsPdf').onclick = () => exportPDF(sheetHTML({ kind: 'answer', title, sub: `${b.name} · ${units.map(u => u.name).join(', ')}`, rows: t.rows, mode: t.mode }), fname + '_답안');
    r.querySelector('#tPrint').onclick = () => { $stage.innerHTML = html; window.print(); };
  }
  if (t.rows) showResult();
}

const shuffleArr = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* rows: { type:'section', name } | { type:'word', qno, qstart, en, ko, blank:'en'|'ko'|null } */
function buildRows(b, units, mode, shuffle) {
  let words = [];
  for (const u of units) {
    for (const q of u.questions) {
      q.words.forEach((w, i) => words.push({ type: 'word', unit: u.name, qno: q.no, qstart: i === 0, en: w.en, ko: w.ko }));
    }
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
  const guide = { en: '한국어 뜻을 보고 알맞은 영어 단어를 쓰세요.', ko: '영어 단어를 보고 알맞은 우리말 뜻을 쓰세요.', mix: '빈칸에 알맞은 영어 단어 또는 우리말 뜻을 쓰세요.' }[mode] || '';
  const cols = showQ ? 4 : 3;
  let h = `<div class="sheet">
    <div class="s-head">
      <div class="s-logo">LUMOS<small>English Academy</small></div>
      <div class="s-title"><b>${esc(title)}${kind === 'answer' ? ' (정답)' : ''}</b><span>${esc(sub)}</span></div>
    </div>`;
  if (isTest) {
    h += `<div class="s-info"><div>이름 :</div><div>날짜 :</div><div class="score">점수 : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / ${rows.filter(r => r.type === 'word').length}</div></div>
      <div class="s-guide">※ ${guide}</div>`;
  }
  h += `<table><colgroup>${showQ ? '<col class="c-q">' : ''}<col class="c-n"><col><col></colgroup>
    <thead><tr>${showQ ? '<th>문제</th>' : ''}<th>No.</th><th>English</th><th>뜻</th></tr></thead><tbody>`;
  let n = 0;
  for (const r of rows) {
    if (r.type === 'section') { h += `<tr class="section"><td colspan="${cols}">${esc(r.name)}</td></tr>`; continue; }
    n++;
    const cell = side => {
      const val = side === 'en' ? r.en : r.ko;
      if (r.blank !== side) return `<td>${esc(val)}</td>`;
      return kind === 'answer' ? `<td class="ans">${esc(val)}</td>` : `<td class="blank"></td>`;
    };
    h += `<tr class="${r.qstart ? 'qstart' : ''}">${showQ ? `<td class="q">${r.qstart ? esc(r.qno) : ''}</td>` : ''}<td class="n">${n}</td>${cell('en')}${cell('ko')}</tr>`;
  }
  h += `</tbody></table><div class="s-foot">LUMOS English Academy</div></div>`;
  return h;
}

/* ================= PDF (A4) ================= */
async function exportPDF(html, filename) {
  if (typeof html2pdf === 'undefined') {
    toast('PDF 라이브러리를 불러오지 못했어요. 인쇄 → PDF로 저장을 이용하세요.');
    $stage.innerHTML = html; window.print(); return;
  }
  toast('PDF 만드는 중…');
  $stage.innerHTML = html;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await html2pdf().set({
      margin: [12, 12, 12, 12],
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.s-head', '.s-info'] },
    }).from($stage.firstElementChild).outputPdf('blob').then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    toast('PDF 저장 완료');
  } catch (e) {
    console.error(e);
    toast('PDF 생성 중 오류가 났어요');
  } finally {
    $stage.innerHTML = '';
  }
}

/* ================= backup ================= */
function renderBackup() {
  const nb = db.books.length, nu = db.books.reduce((s, b) => s + b.units.length, 0);
  $main.innerHTML = `
    <h1 class="page">백업 · 복원</h1>
    <div class="crumb">단어장은 지금 사용 중인 브라우저에 저장돼요. 다른 컴퓨터에서 쓰거나 안전하게 보관하려면 백업 파일을 받아두세요.</div>
    <div class="card"><h2>백업 파일 받기</h2>
      <p class="muted">교재 ${nb}개 · 단원 ${nu}개</p>
      <button class="btn primary" id="bkDown">백업 파일(.json) 다운로드</button></div>
    <div class="card"><h2>백업 파일 불러오기</h2>
      <p class="muted">불러오면 지금 저장된 단어장이 백업 파일 내용으로 <b>바뀝니다</b>.</p>
      <input type="file" id="bkFile" accept="application/json,.json"></div>`;
  $main.querySelector('#bkDown').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lumos-단어장-백업-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  $main.querySelector('#bkFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.books)) throw new Error('형식 오류');
      if (!confirm(`교재 ${d.books.length}개를 불러올까요? 현재 데이터는 바뀝니다.`)) return;
      db = d; save(); toast('불러오기 완료'); go('home', { bookId: null, unitId: null });
    } catch (err) { toast('올바른 백업 파일이 아니에요'); }
  };
}

/* ================= toast ================= */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

render();
