'use strict';

// API 기본 경로 (인트라넷 서버 경로)
const BASE = '/mpoms/vesselci';

const MODE = { ADD: 'add', MODIFY: 'modify', READ: 'read' };
let currentMode = MODE.READ;
let isLoaded = false;
let sortCol = '';
let sortDir = 'asc';
let gridData = [];

const $ = (id) => document.getElementById(id);

const F = {
  vessel_code:    $('vessel_code'),
  vessel_name_eng:$('vessel_name_eng'),
  vessel_name_kor:$('vessel_name_kor'),
  line_code:      $('line_code'),
  line_name:      $('line_name'),
  country_code:   $('country_code'),
  country_name:   $('country_name'),
  call_sign:      $('call_sign'),
  ship_type:      $('ship_type'),
  gross_tonnage:  $('gross_tonnage'),
  dwt:            $('dwt'),
  loa:            $('loa'),
  beam:           $('beam'),
  hatch_count:    $('hatch_count'),
  horsepower:     $('horsepower'),
  draft:          $('draft'),
  cntr_bulk_type: $('cntr_bulk_type'),
  max_hatch:      $('max_hatch'),
  bay_to:         $('bay_to'),
  row_from:       $('row_from'),
  row_to:         $('row_to'),
  rowd_from:      $('rowd_from'),
  rowd_to:        $('rowd_to'),
  tierh_from:     $('tierh_from'),
  tierh_to:       $('tierh_to'),
  tierd_from:     $('tierd_from'),
  tierd_to:       $('tierd_to'),
  crane_count:    $('crane_count'),
  remark1:        $('remark1'),
  remark2:        $('remark2'),
  remark3:        $('remark3'),
};

// ── 초기화 ──────────────────────────────────────────────────────────────────

function init() {
  $('status-date').textContent = new Date().toLocaleDateString('ko-KR');

  $('btn-exit').addEventListener('click', () => { location.href = '/main'; });
  $('btn-search').addEventListener('click', handleSearch);
  $('btn-clear').addEventListener('click', () => { clearForm(false); setMode(MODE.READ); });

  // 권한에 따라 버튼 존재 여부가 EJS에서 제어되므로 null 체크 후 바인딩
  if ($('btn-add'))    $('btn-add').addEventListener('click', handleAdd);
  if ($('btn-save'))   $('btn-save').addEventListener('click', handleSave);
  if ($('btn-delete')) $('btn-delete').addEventListener('click', handleDelete);

  $('btn-code-help').addEventListener('click', () => showMsg('모선코드 검색 팝업을 연결하세요.'));
  $('btn-line-help').addEventListener('click', () => showMsg('LINE코드 검색 팝업을 연결하세요.'));
  $('btn-country-help').addEventListener('click', () => showMsg('국가코드 검색 팝업을 연결하세요.'));

  F.vessel_code.addEventListener('input', () => { F.vessel_code.value = F.vessel_code.value.toUpperCase(); });
  F.vessel_code.addEventListener('blur', onVesselCodeBlur);
  F.line_code.addEventListener('input', () => { F.line_code.value = F.line_code.value.toUpperCase(); });
  F.line_code.addEventListener('blur', onLineCodeBlur);
  F.country_code.addEventListener('input', () => { F.country_code.value = F.country_code.value.toUpperCase(); });
  F.country_code.addEventListener('blur', onCountryCodeBlur);

  const numFields = ['gross_tonnage','dwt','loa','beam','hatch_count','horsepower','draft'];
  numFields.forEach(name => {
    F[name].addEventListener('focus', () => { F[name].value = F[name].value.replace(/,/g, ''); });
    F[name].addEventListener('blur',  () => { F[name].value = fmtNum(F[name].value, name); });
  });

  document.addEventListener('keydown', onKeyDown);

  document.querySelectorAll('#vessel-grid th').forEach(th => {
    th.addEventListener('click', () => onHeaderClick(th.dataset.col));
  });

  // 조회 전용이면 폼 입력 비활성화
  if (AUTH_LEVEL < 2) setFormReadOnly(true);

  setMode(MODE.READ);
  loadGrid();
}

// ── 읽기 전용 처리 ───────────────────────────────────────────────────────────

function setFormReadOnly(flag) {
  Object.values(F).forEach(el => {
    if (el.tagName === 'INPUT' && !el.classList.contains('ro-field')) el.readOnly = flag;
    if (el.tagName === 'SELECT') el.disabled = flag;
  });
}

// ── 키보드 단축키 ────────────────────────────────────────────────────────────

function onKeyDown(e) {
  switch (e.key) {
    case 'Escape': e.preventDefault(); clearForm(false); setMode(MODE.READ); break;
    case 'F3':     e.preventDefault(); if (AUTH_LEVEL >= 2) handleSave();   break;
    case 'F6':     e.preventDefault(); handleSearch(); break;
    case 'F8':     e.preventDefault(); if (AUTH_LEVEL >= 3) handleDelete(); break;
    case 'F9':     e.preventDefault(); if (AUTH_LEVEL >= 2) handleAdd();    break;
  }
}

// ── 모드 설정 ────────────────────────────────────────────────────────────────

function setMode(mode) {
  currentMode = mode;
  if ($('btn-delete')) $('btn-delete').disabled = !isLoaded;
  const msgs = { [MODE.READ]: '조회할 자료를 입력하십시오.', [MODE.ADD]: '추가할 모선 정보를 입력 후 저장하십시오.', [MODE.MODIFY]: '수정할 내용을 입력 후 저장하십시오.' };
  showMsg(msgs[mode] || '');
}

// ── 버튼 핸들러 ──────────────────────────────────────────────────────────────

async function handleSearch() {
  const code = F.vessel_code.value.trim();
  if (!code) { showMsg('모선코드를 입력하십시오.'); F.vessel_code.focus(); return; }
  showMsg('조회중...');
  const r = await api('GET', `${BASE}/api/${code}`);
  if (!r.success) { showMsg(r.message); isLoaded = false; return; }
  fillForm(r.data);
  isLoaded = true;
  setMode(MODE.MODIFY);
  showMsg('조회되었습니다.');
  await loadGrid();
}

function handleAdd() {
  clearForm(false);
  isLoaded = false;
  F.vessel_code.readOnly = false;
  setMode(MODE.ADD);
  F.vessel_code.focus();
}

async function handleSave() {
  if (!validate()) return;

  if (currentMode === MODE.ADD) {
    const check = await api('GET', `${BASE}/api/${F.vessel_code.value.trim()}`);
    if (check.success) {
      showMsg('이미 등록된 모선코드입니다. 수정 모드로 전환합니다.');
      fillForm(check.data);
      isLoaded = true;
      setMode(MODE.MODIFY);
      return;
    }
    const r = await api('POST', `${BASE}/api`, getFormData());
    if (!r.success) { showMsg(r.message); return; }
    showMsg(r.message);
    isLoaded = true;
    setMode(MODE.MODIFY);

  } else if (currentMode === MODE.MODIFY) {
    const r = await api('PUT', `${BASE}/api/${F.vessel_code.value.trim()}`, getFormData());
    if (!r.success) { showMsg(r.message); return; }
    showMsg(r.message);
  }
  await loadGrid();
}

async function handleDelete() {
  if (!isLoaded) { showMsg('먼저 자료를 조회하십시오.'); return; }
  const ok = await modalConfirm('정말 삭제하시겠습니까?');
  if (!ok) return;
  const r = await api('DELETE', `${BASE}/api/${F.vessel_code.value.trim()}`);
  if (!r.success) { showMsg(r.message); return; }
  showMsg(r.message);
  clearForm(false);
  isLoaded = false;
  setMode(MODE.READ);
  await loadGrid();
}

// ── 포커스 이탈 ──────────────────────────────────────────────────────────────

async function onVesselCodeBlur() {
  const code = F.vessel_code.value.trim();
  if (!code || currentMode !== MODE.READ) return;
  const r = await api('GET', `${BASE}/api/${code}`);
  if (r.success) {
    fillForm(r.data); isLoaded = true;
    setMode(MODE.MODIFY); showMsg('조회되었습니다.');
  } else {
    setMode(MODE.ADD); isLoaded = false;
  }
}

async function onLineCodeBlur() {
  const code = F.line_code.value.trim();
  if (!code) { F.line_name.value = ''; return; }
  const r = await api('GET', `${BASE}/api/meta/line/${code}`);
  if (r.success) { F.line_name.value = r.data.line_name || ''; F.line_code.classList.remove('error'); }
  else { F.line_name.value = ''; F.line_code.classList.add('error'); showMsg(r.message); }
}

async function onCountryCodeBlur() {
  const code = F.country_code.value.trim();
  if (!code) { F.country_name.value = ''; return; }
  const r = await api('GET', `${BASE}/api/meta/country/${code}`);
  if (r.success) { F.country_name.value = r.data.country_name || ''; F.country_code.classList.remove('error'); }
  else { F.country_name.value = ''; F.country_code.classList.add('error'); showMsg(r.message); }
}

// ── 그리드 ───────────────────────────────────────────────────────────────────

async function loadGrid() {
  const r = await api('GET', `${BASE}/api/list`);
  if (!r.success) { showMsg(r.message); return; }
  gridData = r.data;
  renderGrid(gridData);
}

function renderGrid(data) {
  const tbody = $('grid-body');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#888">자료가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(row => `
    <tr data-code="${esc(row.vessel_code)}">
      <td class="center">${esc(row.vessel_code)}</td>
      <td>${esc(row.vessel_name_eng)}</td>
      <td class="center">${esc(row.country_code)}</td>
      <td class="center">${esc(row.line_code)}</td>
      <td class="center">${esc(row.call_sign)}</td>
      <td class="right">${fmtGross(row.gross_tonnage)}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => { document.querySelectorAll('#grid-body tr').forEach(r => r.classList.remove('selected')); tr.classList.add('selected'); });
    tr.addEventListener('dblclick', async () => {
      F.vessel_code.value = tr.dataset.code;
      const r = await api('GET', `${BASE}/api/${tr.dataset.code}`);
      if (r.success) { fillForm(r.data); isLoaded = true; setMode(MODE.MODIFY); showMsg('조회되었습니다.'); tr.classList.add('selected'); }
    });
  });
}

function onHeaderClick(col) {
  sortDir = (sortCol === col && sortDir === 'asc') ? 'desc' : 'asc';
  sortCol = col;
  document.querySelectorAll('#vessel-grid th').forEach(th => {
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.col === col) th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  });
  renderGrid([...gridData].sort((a, b) => {
    const va = String(a[col] ?? ''), vb = String(b[col] ?? '');
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  }));
}

// ── 폼 처리 ──────────────────────────────────────────────────────────────────

function fillForm(d) {
  F.vessel_code.value      = d.vessel_code || '';
  F.vessel_name_eng.value  = d.vessel_name_eng || '';
  F.vessel_name_kor.value  = d.vessel_name_kor || '';
  F.line_code.value        = d.line_code || '';
  F.line_name.value        = d.line_name || '';
  F.country_code.value     = d.country_code || '';
  F.country_name.value     = d.country_name || '';
  F.call_sign.value        = d.call_sign || '';
  F.ship_type.value        = d.ship_type || '';
  F.gross_tonnage.value    = fmtNum(d.gross_tonnage, 'gross_tonnage');
  F.dwt.value              = fmtNum(d.dwt, 'dwt');
  F.loa.value              = fmtNum(d.loa, 'loa');
  F.beam.value             = fmtNum(d.beam, 'beam');
  F.hatch_count.value      = fmtNum(d.hatch_count, 'hatch_count');
  F.horsepower.value       = fmtNum(d.horsepower, 'horsepower');
  F.draft.value            = fmtNum(d.draft, 'draft');
  F.cntr_bulk_type.value   = d.cntr_bulk_type || '';
  F.max_hatch.value        = d.max_hatch || '';
  F.bay_to.value           = d.bay_to || '';
  F.row_from.value         = d.row_from || '';   F.row_to.value   = d.row_to || '';
  F.rowd_from.value        = d.rowd_from || '';  F.rowd_to.value  = d.rowd_to || '';
  F.tierh_from.value       = d.tierh_from || ''; F.tierh_to.value = d.tierh_to || '';
  F.tierd_from.value       = d.tierd_from || ''; F.tierd_to.value = d.tierd_to || '';
  F.crane_count.value      = d.crane_count || '';
  F.remark1.value          = d.remark1 || '';
  F.remark2.value          = d.remark2 || '';
  F.remark3.value          = d.remark3 || '';
  clearErrors();
  if (AUTH_LEVEL >= 2) F.vessel_code.readOnly = true;
}

function clearForm(keepCode) {
  const saved = F.vessel_code.value;
  Object.values(F).forEach(el => { el.tagName === 'SELECT' ? (el.selectedIndex = 0) : (el.value = ''); });
  if (keepCode) F.vessel_code.value = saved;
  if (AUTH_LEVEL >= 2) F.vessel_code.readOnly = false;
  clearErrors();
}

function getFormData() {
  return {
    vessel_code:     F.vessel_code.value.toUpperCase().trim(),
    vessel_name_eng: F.vessel_name_eng.value.trim(),
    vessel_name_kor: F.vessel_name_kor.value.trim(),
    line_code:       F.line_code.value.toUpperCase().trim(),
    country_code:    F.country_code.value.toUpperCase().trim(),
    call_sign:       F.call_sign.value.trim(),
    ship_type:       F.ship_type.value.trim(),
    gross_tonnage:   F.gross_tonnage.value.replace(/,/g, ''),
    dwt:             F.dwt.value.replace(/,/g, ''),
    loa:             F.loa.value.replace(/,/g, ''),
    beam:            F.beam.value.replace(/,/g, ''),
    hatch_count:     F.hatch_count.value.replace(/,/g, ''),
    horsepower:      F.horsepower.value.replace(/,/g, ''),
    draft:           F.draft.value.replace(/,/g, ''),
    cntr_bulk_type:  F.cntr_bulk_type.value,
    max_hatch:       F.max_hatch.value.trim(),
    bay_to:          F.bay_to.value.trim(),
    row_from:        F.row_from.value.trim(),   row_to:   F.row_to.value.trim(),
    rowd_from:       F.rowd_from.value.trim(),  rowd_to:  F.rowd_to.value.trim(),
    tierh_from:      F.tierh_from.value.trim(), tierh_to: F.tierh_to.value.trim(),
    tierd_from:      F.tierd_from.value.trim(), tierd_to: F.tierd_to.value.trim(),
    crane_count:     F.crane_count.value.trim(),
    remark1:         F.remark1.value.trim(),
    remark2:         F.remark2.value.trim(),
    remark3:         F.remark3.value.trim(),
  };
}

// ── 유효성 ───────────────────────────────────────────────────────────────────

function validate() {
  clearErrors();
  if (!F.vessel_code.value.trim()) { markErr(F.vessel_code, '모선코드를 입력하십시오.'); F.vessel_code.focus(); return false; }
  if (!F.vessel_name_eng.value.trim()) { markErr(F.vessel_name_eng, '모선명(영문)을 입력하십시오.'); F.vessel_name_eng.focus(); return false; }
  if (!F.call_sign.value.trim()) { markErr(F.call_sign, '호출부호를 입력하십시오.'); F.call_sign.focus(); return false; }
  return true;
}

function markErr(el, msg) { el.classList.add('error'); showMsg(msg); }
function clearErrors() { Object.values(F).forEach(el => el.classList && el.classList.remove('error')); }

// ── 공통 유틸 ────────────────────────────────────────────────────────────────

async function api(method, url, body) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (r.status === 401) { location.href = '/login'; return { success: false }; }
    if (r.status === 403) { showMsg('접근 권한이 없습니다.'); return { success: false, message: '접근 권한이 없습니다.' }; }
    return await r.json();
  } catch (e) {
    return { success: false, message: '서버 연결 오류: ' + e.message };
  }
}

function showMsg(msg) { $('status-msg').textContent = msg; }

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtGross(v) {
  if (v == null || v === '') return '';
  const n = parseFloat(v);
  return isNaN(n) ? String(v) : n.toLocaleString('ko-KR');
}

function fmtNum(val, fieldName) {
  if (val === null || val === undefined || val === '') return '';
  const n = parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(n)) return '';
  if (['loa','beam','horsepower','draft'].includes(fieldName))
    return n.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n.toLocaleString('ko-KR');
}

function modalConfirm(msg) {
  return new Promise(resolve => {
    $('modal-confirm-msg').textContent = msg;
    $('modal-confirm').classList.add('show');
    const yes = $('modal-yes'), no = $('modal-no');
    function done(v) {
      $('modal-confirm').classList.remove('show');
      yes.removeEventListener('click', onY);
      no.removeEventListener('click', onN);
      resolve(v);
    }
    const onY = () => done(true), onN = () => done(false);
    yes.addEventListener('click', onY);
    no.addEventListener('click', onN);
  });
}

document.addEventListener('DOMContentLoaded', init);
