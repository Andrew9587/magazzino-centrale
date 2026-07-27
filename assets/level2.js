/* ============================================================
   LIVELLO 2 — Operatore Magazzino
   ------------------------------------------------------------
   Logica estratta 1:1 dal file singolo funzionante.
   Le utility, lo storage e i dati demo vivono ora in mgc-core.js
   (stessi nomi di funzione: il codice sotto e' invariato).
   ============================================================ */
(function(){
'use strict';

/* ---- dal core: stessi nomi usati dal codice originale ---- */
var U = MGC.Utils;
var FASCE = U.FASCE, TIPO_LABEL = U.TIPO_LABEL;
var pad = U.pad, toDateStr = U.toDateStr, fmtDateLong = U.fmtDateLong, fmtDateShort = U.fmtDateShort;
var isWeekday = U.isWeekday, timeToMin = U.timeToMin, minToTime = U.minToTime, addMinutes = U.addMinutes;
var uid = U.uid, escapeHtml = U.escapeHtml;
var generaSlotsGiorno = U.generaSlotsGiorno, durataAppuntamento = U.durataAppuntamento;
var numSlotOccupati = U.numSlotOccupati, eccezionaleConsentitoA = U.eccezionaleConsentitoA;
var orariOccupatiDaAppuntamento = U.orariOccupatiDaAppuntamento;
var slotEffettivamenteLibero = U.slotEffettivamenteLibero;

let DATA = null;
let currentUser = null;
let currentDate = null;
let pendingAction = null;
let currentView = 'agenda';

/* ---- wrapper sottili sul core: le chiamate esistenti restano identiche ---- */
function saveData(){ return MGC.Store.save(DATA); }
function aggiungiLog(tipo, testo, notificaA, fornitoreCoinvolti){
  MGC.Store.addLog(DATA, tipo, testo, notificaA, fornitoreCoinvolti);
}

function showToast(msg, kind){
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' '+kind : '');
  const icons = {
    verde: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg>',
    rosso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    ambra: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 2"/></svg>'
  };
  el.innerHTML = (icons[kind]||icons.verde) + '<span>'+escapeHtml(msg)+'</span>';
  stack.appendChild(el);
  setTimeout(()=> el.remove(), 4200);
}

// ============================================================
// LOGIN
// ============================================================
function doLogout(){
  MGC.Session.logout();
}
document.getElementById('sb-logout-btn').addEventListener('click', doLogout);
document.getElementById('logout-btn-mobile').addEventListener('click', doLogout);

// ============================================================
// NAVIGATION (sidebar desktop + bottom nav mobile, stesso stato)
// ============================================================
document.querySelectorAll('.sb-nav-item[data-view], .bn-item[data-view]').forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});
document.querySelectorAll('.bn-item[data-action="account"]').forEach(item => {
  item.addEventListener('click', () => { document.getElementById('modal-account').classList.add('active'); });
});

function switchView(view){
  currentView = view;
  if (view !== 'chat') chatFornitoreAttivo = null;
  document.querySelectorAll('.sb-nav-item[data-view]').forEach(i => i.classList.toggle('active', i.dataset.view === view));
  document.querySelectorAll('.bn-item[data-view]').forEach(i => i.classList.toggle('active', i.dataset.view === view));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + view).classList.add('active');
  renderView(view);
}

function renderView(view){
  if (view === 'agenda') renderAgenda();
  else if (view === 'elenco') renderElenco();
  else if (view === 'fornitori') renderFornitori();
  else if (view === 'registro') renderRegistro();
  else if (view === 'chat') renderChat();
  updateBadges();
}

function updateBadges(){
  const tot = DATA.appuntamenti.filter(a => a.stato === 'confermato').length;
  const log = DATA.registro.length;
  ['sb-badge-tot','bn-badge-tot'].forEach(id => { const el = document.getElementById(id); if(el){ el.textContent = tot; el.style.display = tot ? '' : 'none'; } });
  ['sb-badge-log','bn-badge-log'].forEach(id => { const el = document.getElementById(id); if(el){ el.textContent = log; el.style.display = log ? '' : 'none'; } });
  aggiornaBadgeChat();
}

function fornitoreById(id){ return DATA.fornitori.find(f => f.id === id); }

// ============================================================
// AGENDA
// ============================================================
function renderAgenda(){
  const grid = document.getElementById('stats-grid');
  const appDelGiorno = DATA.appuntamenti.filter(a => a.data === currentDate && a.stato === 'confermato').sort((a,b) => timeToMin(a.oraOriginale) - timeToMin(b.oraOriginale));
  const slots = generaSlotsGiorno();
  const slotsMattina = slots.filter(s => s.periodo === 'mattina');
  const slotsPomeriggio = slots.filter(s => s.periodo === 'pomeriggio');
  const occupatiCount = appDelGiorno.length;
  const ritardiAttivi = appDelGiorno.filter(a => a.ritardoMin > 0).length;
  const liberiCount = slots.filter(s => slotEffettivamenteLibero(appDelGiorno, s.ora)).length;

  grid.innerHTML = `
    <div class="stat-card" data-stat-action="elenco" title="Vai all'elenco appuntamenti">
      <div class="label">Appuntamenti</div><div class="value">${occupatiCount}</div><div class="sub">su ${slots.length} fasce</div>
    </div>
    <div class="stat-card" data-stat-action="nuovo" title="Prenota una fascia libera">
      <div class="label">Fasce libere</div><div class="value verde">${liberiCount}</div><div class="sub">prenotabili →</div>
    </div>
    <div class="stat-card" data-stat-action="registro-ritardi" title="Vedi registro ritardi">
      <div class="label">Ritardi attivi</div><div class="value ambra">${ritardiAttivi}</div><div class="sub">${ritardiAttivi > 0 ? 'tocca per dettagli →' : 'nessun ritardo'}</div>
    </div>
    <div class="stat-card" data-stat-action="fornitori" title="Vai all'anagrafica fornitori">
      <div class="label">Fornitori</div><div class="value">${DATA.fornitori.length}</div><div class="sub">abilitati →</div>
    </div>
  `;
  grid.querySelectorAll('[data-stat-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.statAction;
      if (action === 'elenco') switchView('elenco');
      else if (action === 'nuovo') openModalNuovo();
      else if (action === 'fornitori') switchView('fornitori');
      else if (action === 'registro-ritardi') { switchView('registro'); }
    });
  });

  document.getElementById('day-nav-d1').textContent = fmtDateShort(currentDate);
  document.getElementById('day-nav-d2').textContent = fmtDateLong(currentDate);
  document.getElementById('agenda-date-picker').value = currentDate;

  const slotsContainer = document.getElementById('agenda-slots');
  slotsContainer.innerHTML = `
    <div class="fascia-header">
      <span class="ftitle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>Mattina</span>
      <span class="frange">08:30 – 12:30</span>
    </div>
    <div class="slot-list">${slotsMattina.map(s => renderSlotRow(s, appDelGiorno)).join('')}</div>
    <div class="fascia-header">
      <span class="ftitle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v1M21 12h-1M4 12H3M18.36 5.64l-.7.7M6.34 6.34l-.7-.7M21 16H3a9 9 0 0 0 18 0Z"/></svg>Pomeriggio</span>
      <span class="frange">14:00 – 16:30</span>
    </div>
    <div class="slot-list">${slotsPomeriggio.map(s => renderSlotRow(s, appDelGiorno)).join('')}</div>
  `;

  slotsContainer.querySelectorAll('[data-slot-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = el.dataset.slotAction;
      const apptId = el.dataset.apptId;
      if (action === 'nuovo') openModalNuovo(el.dataset.ora);
      else if (action === 'dettaglio') openModalDettaglio(apptId);
      else if (action === 'cancella') openModalCancella(apptId);
      else if (action === 'ritardo') openModalRitardo(apptId);
    });
  });
}

function renderSlotRow(slot, appDelGiorno){
  const appt = appDelGiorno.find(a => a.oraOriginale === slot.ora);
  if (!appt){
    const coperturaEcc = appDelGiorno.find(a => a.tipo === 'eccezionale' && orariOccupatiDaAppuntamento(a).includes(slot.ora) && a.oraOriginale !== slot.ora);
    if (coperturaEcc){
      const f = fornitoreById(coperturaEcc.fornitoreId);
      return `
        <div class="slot-row occupato-cascata">
          <div class="slot-time-col"><span class="t">${slot.ora}</span></div>
          <div class="slot-body">
            <div class="tag-row"><span class="tipo-tag eccezionale">Continua eccezionale</span></div>
            <div class="fornitore-nome" style="color:var(--ardesia-400); font-weight:500;">${escapeHtml(f ? f.nome : '')}</div>
            <div class="cascata-info">Occupato dalle ${coperturaEcc.oraOriginale}</div>
          </div>
        </div>`;
    }
    return `
      <div class="slot-row libero" data-slot-action="nuovo" data-ora="${slot.ora}" tabindex="0">
        <div class="slot-time-col"><span class="t">${slot.ora}</span></div>
        <div class="slot-body"><div class="fornitore-vuoto">Libero — tocca per prenotare</div></div>
      </div>`;
  }
  const f = fornitoreById(appt.fornitoreId);
  const nomeF = f ? f.nome : 'Fornitore non disponibile';
  const ritardato = appt.ritardoMin > 0;
  const classe = appt.tipo === 'eccezionale' ? 'eccezionale' : (ritardato ? 'ritardo' : '');
  return `
    <div class="slot-row ${classe} slot-row-clickable" data-slot-action="dettaglio" data-appt-id="${appt.id}" tabindex="0" role="button" aria-label="Dettaglio appuntamento ${escapeHtml(nomeF)}">
      <div class="slot-time-col">
        <span class="t">${appt.oraOriginale}</span>
        ${ritardato ? `<span class="t-arrow">→ ${appt.ora}</span>` : ''}
      </div>
      <div class="slot-body">
        <div class="tag-row">
          <span class="tipo-tag ${appt.tipo}">${TIPO_LABEL[appt.tipo]}</span>
          ${ritardato ? `<span class="ritardo-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>+${appt.ritardoMin}m</span>` : ''}
        </div>
        <div class="fornitore-nome" title="${escapeHtml(nomeF)}">${escapeHtml(nomeF)}</div>
      </div>
      <div class="slot-actions-col">
        <button class="icon-btn ambra" data-slot-action="ritardo" data-appt-id="${appt.id}" title="Segnala ritardo" aria-label="Segnala ritardo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </button>
        <button class="icon-btn danger" data-slot-action="cancella" data-appt-id="${appt.id}" title="Cancella" aria-label="Cancella appuntamento">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        </button>
      </div>
    </div>`;
}

function shiftDay(delta){ const d = new Date(currentDate + 'T00:00:00'); d.setDate(d.getDate() + delta); currentDate = toDateStr(d); renderAgenda(); }
document.getElementById('btn-prev-day').addEventListener('click', () => shiftDay(-1));
document.getElementById('btn-next-day').addEventListener('click', () => shiftDay(1));
document.getElementById('btn-today').addEventListener('click', () => { currentDate = toDateStr(new Date()); chiudiCalendario(); renderAgenda(); });
document.getElementById('agenda-date-picker').addEventListener('change', (e) => { currentDate = e.target.value; renderAgenda(); });

// ============================================================
// CALENDARIO POPUP VISIVO
// ============================================================
let calViewYear = null, calViewMonth = null, calPopupOpen = false;

document.getElementById('btn-cal-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleCalendario();
});

document.getElementById('day-nav-label-wrap').addEventListener('click', (e) => {
  if (e.target.tagName === 'INPUT') return;
});

function toggleCalendario(){
  if (calPopupOpen){ chiudiCalendario(); return; }
  const d = new Date(currentDate + 'T00:00:00');
  calViewYear = d.getFullYear();
  calViewMonth = d.getMonth();
  renderCalendario();
  calPopupOpen = true;
}

function chiudiCalendario(){
  const popup = document.getElementById('cal-popup');
  if (popup) popup.remove();
  calPopupOpen = false;
}

function renderCalendario(){
  chiudiCalendario();
  const oggi = toDateStr(new Date());
  const sel = currentDate;
  const primoGiorno = new Date(calViewYear, calViewMonth, 1);
  const ultimoGiorno = new Date(calViewYear, calViewMonth + 1, 0);
  const nomeMs = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const giorni = ['Lu','Ma','Me','Gi','Ve','Sa','Do'];

  // Giorni da mostrare (lunedì come primo)
  let startDow = primoGiorno.getDay(); // 0=dom
  startDow = startDow === 0 ? 6 : startDow - 1; // converti a lun=0

  let cells = '';
  // Celle vuote prima
  for (let i = 0; i < startDow; i++){
    const d = new Date(calViewYear, calViewMonth, 1 - (startDow - i));
    cells += `<div class="cal-day other-month">${d.getDate()}</div>`;
  }
  // Giorni del mese
  for (let day = 1; day <= ultimoGiorno.getDate(); day++){
    const d = new Date(calViewYear, calViewMonth, day);
    const dateStr = toDateStr(d);
    const dow = d.getDay(); // 0=dom, 6=sab
    const isWeekend = dow === 0 || dow === 6;
    const isOggi = dateStr === oggi;
    const isSel = dateStr === sel;
    let cls = 'cal-day';
    if (isSel) cls += ' selected';
    else if (isOggi) cls += ' today';
    if (isWeekend && !isSel) cls += ' weekend';
    cells += `<div class="${cls}" data-date="${dateStr}">${day}</div>`;
  }

  const popup = document.createElement('div');
  popup.className = 'cal-popup';
  popup.id = 'cal-popup';
  popup.innerHTML = `
    <div class="cal-popup-head">
      <button id="cal-prev-month" aria-label="Mese precedente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg></button>
      <span class="cal-month">${nomeMs[calViewMonth]} ${calViewYear}</span>
      <button id="cal-next-month" aria-label="Mese successivo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>
    <div class="cal-weekdays">${giorni.map(g=>`<div class="cal-weekday">${g}</div>`).join('')}</div>
    <div class="cal-days">${cells}</div>
    <div class="cal-footer"><button id="cal-oggi-btn">Vai a oggi</button></div>
  `;

  const dayNav = document.getElementById('day-nav-label-wrap').closest('.day-nav');
  dayNav.appendChild(popup);

  popup.querySelector('#cal-prev-month').addEventListener('click', (e) => { e.stopPropagation(); calViewMonth--; if(calViewMonth<0){ calViewMonth=11; calViewYear--; } renderCalendario(); });
  popup.querySelector('#cal-next-month').addEventListener('click', (e) => { e.stopPropagation(); calViewMonth++; if(calViewMonth>11){ calViewMonth=0; calViewYear++; } renderCalendario(); });
  popup.querySelector('#cal-oggi-btn').addEventListener('click', (e) => { e.stopPropagation(); currentDate = toDateStr(new Date()); chiudiCalendario(); renderAgenda(); });
  popup.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDate = el.dataset.date;
      chiudiCalendario();
      renderAgenda();
    });
  });

  calPopupOpen = true;
  // Chiudi cliccando fuori
  setTimeout(() => {
    document.addEventListener('click', function handler(e){
      if (!popup.contains(e.target)){ chiudiCalendario(); document.removeEventListener('click', handler); }
    });
  }, 50);
}
document.getElementById('fab-nuovo').addEventListener('click', () => openModalNuovo());
document.getElementById('btn-nuovo-desktop').addEventListener('click', () => openModalNuovo());

// ============================================================
// ELENCO APPUNTAMENTI
// ============================================================
function renderElenco(){
  const tutti = DATA.appuntamenti.filter(a => a.stato === 'confermato').sort((a,b) => (a.data+a.oraOriginale).localeCompare(b.data+b.oraOriginale));
  document.getElementById('elenco-sub').textContent = `${tutti.length} appuntamenti confermati`;

  let body;
  if (tutti.length === 0){
    body = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><div class="t">Nessun appuntamento pianificato</div><div class="s">Crea il primo appuntamento per iniziare</div></div>`;
  } else {
    body = tutti.map(a => {
      const f = fornitoreById(a.fornitoreId);
      const d = new Date(a.data + 'T00:00:00');
      const dataFmt = d.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
      const pill = a.tipo === 'eccezionale' ? `<span class="pill pill-eccezionale">Eccezionale</span>` : a.ritardoMin > 0 ? `<span class="pill pill-ritardo">Ritardo +${a.ritardoMin}m</span>` : `<span class="pill pill-ok">Confermato</span>`;
      return `
        <div class="appt-card">
          <div class="arow1"><span class="adate">${dataFmt}</span><span class="atime">${a.oraOriginale}${a.ritardoMin>0 ? ` → ${a.ora}`:''}</span></div>
          <div class="afornitore">${escapeHtml(f ? f.nome : '—')}</div>
          <div class="arow2">
            <div><span class="tipo-tag ${a.tipo}">${TIPO_LABEL[a.tipo]}</span> ${pill}</div>
            <div class="aactions">
              <button class="icon-btn-sm" data-elenco-action="ritardo" data-appt-id="${a.id}" title="Ritardo" aria-label="Segnala ritardo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></button>
              <button class="icon-btn-sm" data-elenco-action="cancella" data-appt-id="${a.id}" title="Cancella" aria-label="Cancella"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  document.getElementById('elenco-panel').innerHTML = body;
  document.querySelectorAll('[data-elenco-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.elencoAction; const apptId = el.dataset.apptId;
      if (action === 'cancella') openModalCancella(apptId);
      else if (action === 'ritardo') openModalRitardo(apptId);
    });
  });
}

// ============================================================
// FORNITORI
// ============================================================
function renderFornitori(){
  document.getElementById('fornitori-sub').textContent = `${DATA.fornitori.length} fornitori abilitati`;
  const body = DATA.fornitori.map(f => {
    const count = DATA.appuntamenti.filter(a => a.fornitoreId === f.id && a.stato === 'confermato').length;
    return `
      <div class="fornitore-card">
        <div class="fnome">${escapeHtml(f.nome)}</div>
        <div class="fmeta">${escapeHtml(f.referente)} · ${escapeHtml(f.telefono)}</div>
        <div class="fmeta">${escapeHtml(f.email)}</div>
        <div class="fcount"><span class="pill pill-ok">${count} attivi</span></div>
      </div>`;
  }).join('');
  document.getElementById('fornitori-panel').innerHTML = body;
}

// ============================================================
// REGISTRO
// ============================================================
function renderRegistro(){
  const icons = {
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M12 5v14M5 12h14"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    delay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };
  const tipoLabel = { add:'Appuntamento creato', del:'Appuntamento cancellato', delay:'Ritardo segnalato', info:'Sistema' };
  const tipoBg = { add:'var(--verde-bg)', del:'var(--rosso-bg)', delay:'var(--ambra-bg)', info:'var(--blu-050)' };
  const tipoColor = { add:'var(--verde)', del:'var(--rosso)', delay:'var(--ambra)', info:'var(--blu-700)' };

  function canaliNotifiche(l){
    if (!l.fornitori || l.fornitori.length === 0) return '';
    return `
      <div style="margin-top:10px; display:flex; flex-direction:column; gap:5px;">
        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:var(--ardesia-500); margin-bottom:2px;">Notifiche inviate</div>
        ${l.fornitori.map(ff => `
          <div style="background:#fff; border:1px solid var(--ardesia-100); border-radius:8px; padding:8px 10px; font-size:12px;">
            <div style="font-weight:700; color:var(--ardesia-900); margin-bottom:5px;">${escapeHtml(ff.nome)}</div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:7px; color:var(--ardesia-700);">
                <span style="font-size:13px;">📲</span>
                <span style="flex:1; font-weight:600;">Notifica Push</span>
                <span style="font-size:10px; background:var(--verde-bg); color:var(--verde); font-weight:700; padding:2px 7px; border-radius:100px;">✓ Inviata</span>
              </div>
              <div style="display:flex; align-items:center; gap:7px; color:var(--ardesia-700);">
                <span style="font-size:13px;">✉️</span>
                <span style="flex:1; font-size:11px; color:var(--ardesia-500); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(ff.email||'—')}</span>
                <span style="font-size:10px; background:var(--verde-bg); color:var(--verde); font-weight:700; padding:2px 7px; border-radius:100px;">✓ Inviata</span>
              </div>
              <div style="display:flex; align-items:center; gap:7px; color:var(--ardesia-700);">
                <span style="font-size:13px;">💬</span>
                <span style="flex:1; font-size:11px; color:var(--ardesia-500);">${escapeHtml(ff.telefono||'—')}</span>
                <span style="font-size:10px; background:var(--verde-bg); color:var(--verde); font-weight:700; padding:2px 7px; border-radius:100px;">✓ WhatsApp</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const items = DATA.registro.length === 0
    ? `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg><div class="t">Nessuna attività registrata</div><div class="s">Le operazioni effettuate compariranno qui</div></div>`
    : DATA.registro.map(l => {
        const d = new Date(l.meta);
        const dataFmt = d.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' alle ' + d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
        const cls = l.tipo || 'info';
        const bg = tipoBg[cls] || tipoBg.info;
        const color = tipoColor[cls] || tipoColor.info;
        const label = tipoLabel[cls] || 'Operazione';
        return `
          <div class="log-item" style="flex-direction:column; gap:10px;">
            <div style="display:flex; align-items:flex-start; gap:10px;">
              <div class="log-icon ${cls}" style="background:${bg}; color:${color}; flex-shrink:0;">${icons[cls] || icons.info}</div>
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:7px; margin-bottom:3px; flex-wrap:wrap;">
                  <span style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:${color}; background:${bg}; padding:2px 8px; border-radius:100px;">${label}</span>
                  <span class="log-meta">${dataFmt}</span>
                </div>
                <div class="log-text">${l.testo}</div>
              </div>
            </div>
            ${canaliNotifiche(l)}
          </div>`;
      }).join('');
  document.getElementById('registro-panel').innerHTML = `<div style="padding:0 4px;">${items}</div>`;
}

// ============================================================
// MODALS — NUOVO APPUNTAMENTO
// ============================================================
function openModalNuovo(presetOra){
  const sel = document.getElementById('nf-fornitore');
  sel.innerHTML = DATA.fornitori.map(f => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join('');
  document.getElementById('nf-data').value = currentDate;
  const oraSel = document.getElementById('nf-ora');
  const slots = generaSlotsGiorno();
  oraSel.innerHTML = slots.map(s => `<option value="${s.ora}" data-periodo="${s.periodo}">${s.ora}</option>`).join('');
  if (presetOra) oraSel.value = presetOra;
  document.getElementById('nf-tipo').value = 'carico';
  aggiornaDisponibilitaEccezionale();
  aggiornaRiepilogoNuovo();
  document.getElementById('nf-pwd').value = '';
  document.getElementById('nf-pwd-error').style.display = 'none';
  document.getElementById('nf-slot-error').style.display = 'none';
  document.getElementById('modal-nuovo').classList.add('active');
}

function aggiornaRiepilogoNuovo(){
  const data = document.getElementById('nf-data').value || currentDate;
  const ora = document.getElementById('nf-ora').value;
  if (!data || !ora) return;
  const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  document.getElementById('nf-riepilogo-testo').innerHTML = `Stai prenotando: <b style="text-transform:capitalize">${dataFmt}</b> alle <b>${ora}</b>`;
}

function aggiornaDisponibilitaEccezionale(){
  const data = document.getElementById('nf-data').value || currentDate;
  const oraSel = document.getElementById('nf-ora');
  const ora = oraSel.value;
  const periodoOpt = oraSel.selectedOptions[0];
  const periodo = periodoOpt ? periodoOpt.dataset.periodo : null;
  const tipoSel = document.getElementById('nf-tipo');
  const eccOption = tipoSel.querySelector('option[value="eccezionale"]');
  const appDelGiorno = DATA.appuntamenti.filter(a => a.data === data && a.stato === 'confermato');
  const successivoOra = addMinutes(ora, 30);
  const slots = generaSlotsGiorno();
  const successivoEsiste = slots.some(s => s.ora === successivoOra && s.periodo === periodo);
  const consentito = periodo && eccezionaleConsentitoA(ora, periodo) && successivoEsiste && slotEffettivamenteLibero(appDelGiorno, ora) && slotEffettivamenteLibero(appDelGiorno, successivoOra);
  eccOption.disabled = !consentito;
  if (!consentito){
    if (!eccezionaleConsentitoA(ora, periodo)){
      eccOption.textContent = 'Eccezionale (1h) — ultimo slot fascia';
    } else if (!slotEffettivamenteLibero(appDelGiorno, successivoOra)){
      eccOption.textContent = `Eccezionale (1h) — ${successivoOra} già occupato`;
    } else {
      eccOption.textContent = 'Eccezionale (1h) — non disponibile';
    }
  } else {
    eccOption.textContent = 'Carico/scarico eccezionale (1h)';
  }
  if (!consentito && tipoSel.value === 'eccezionale') tipoSel.value = 'carico';
}

document.getElementById('nf-ora').addEventListener('change', function(){ aggiornaDisponibilitaEccezionale(); aggiornaRiepilogoNuovo(); });
document.getElementById('nf-data').addEventListener('change', function(){ aggiornaDisponibilitaEccezionale(); aggiornaRiepilogoNuovo(); });
document.getElementById('nf-tipo').addEventListener('change', function(){ document.getElementById('nf-slot-error').style.display = 'none'; });

document.getElementById('nf-confirm').addEventListener('click', async function(){
  const pwd = document.getElementById('nf-pwd').value;
  if (pwd !== '2580'){ document.getElementById('nf-pwd-error').style.display = 'block'; return; }
  document.getElementById('nf-pwd-error').style.display = 'none';
  document.getElementById('nf-slot-error').style.display = 'none';

  const fornitoreId = document.getElementById('nf-fornitore').value;
  const data = document.getElementById('nf-data').value;
  const ora = document.getElementById('nf-ora').value;
  const tipo = document.getElementById('nf-tipo').value;
  const oraSel = document.getElementById('nf-ora');
  const periodo = oraSel.selectedOptions[0] ? oraSel.selectedOptions[0].dataset.periodo : null;
  if (!data || !ora) return;

  const appDelGiorno = DATA.appuntamenti.filter(a => a.data===data && a.stato==='confermato');
  if (!slotEffettivamenteLibero(appDelGiorno, ora)){
    document.getElementById('nf-slot-error').textContent = 'Questa fascia è già occupata: scegliere un altro orario.';
    document.getElementById('nf-slot-error').style.display = 'block';
    return;
  }
  if (tipo === 'eccezionale'){
    const successivoOra = addMinutes(ora, 30);
    const slots = generaSlotsGiorno();
    const successivoEsiste = slots.some(s => s.ora === successivoOra && s.periodo === periodo);
    const consentito = eccezionaleConsentitoA(ora, periodo) && successivoEsiste && slotEffettivamenteLibero(appDelGiorno, successivoOra);
    if (!consentito){
      const motivazione = !eccezionaleConsentitoA(ora, periodo)
        ? 'Non è possibile prenotare un eccezionale nell\'ultimo slot della fascia (non ci sarebbe spazio per l\'ora richiesta).'
        : !successivoEsiste
          ? 'Non c\'è uno slot successivo disponibile nella stessa fascia oraria.'
          : `Lo slot delle ${successivoOra} è già occupato da un altro fornitore. L'eccezionale richiede 1 ora e occupa anche lo slot successivo.`;
      document.getElementById('nf-slot-error').textContent = motivazione;
      document.getElementById('nf-slot-error').style.display = 'block';
      return;
    }
  }

  const nuovo = { id: uid('app'), fornitoreId, data, ora, oraOriginale: ora, tipo, ritardoMin:0, stato:'confermato', creatoDa: currentUser.username };
  DATA.appuntamenti.push(nuovo);
  const f = fornitoreById(fornitoreId);
  const oraFine = addMinutes(ora, durataAppuntamento(tipo));
  aggiungiLog('add',
    `Nuovo appuntamento creato per <b>${escapeHtml(f.nome)}</b> — ${data} alle ${ora}${tipo==='eccezionale' ? ` (fino alle ${oraFine})` : ''} (${TIPO_LABEL[tipo]}).`,
    f.nome,
    [{ nome: f.nome, email: f.email, telefono: f.telefono }]
  );
  await saveData();
  closeModal('modal-nuovo');
  showToast(`Appuntamento confermato e notificato a ${f.nome}.`, 'verde');
  renderView(currentView);
});

// ============================================================
// MODALS — CANCELLA
// ============================================================
function openModalDettaglio(apptId){
  const a = DATA.appuntamenti.find(x => x.id === apptId);
  if (!a) return;
  const f = fornitoreById(a.fornitoreId);
  const dataFmt = new Date(a.data + 'T00:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const ritardato = a.ritardoMin > 0;

  const infoRow = (label, value, highlight) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:11px 0; border-bottom:1px solid var(--ardesia-100);">
      <span style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:var(--ardesia-500);">${label}</span>
      <span style="font-size:14px; font-weight:600; color:${highlight||'var(--ardesia-900)'}; text-align:right;">${value}</span>
    </div>`;

  const oraDisplay = ritardato
    ? `<span style="text-decoration:line-through; color:var(--ardesia-300);">${a.oraOriginale}</span> → <span style="color:var(--ambra); font-weight:700;">${a.ora}</span>`
    : `<span>${a.oraOriginale}</span>`;

  const durataMin = durataAppuntamento(a.tipo);

  document.getElementById('dettaglio-body').innerHTML = `
    <div style="background:var(--blu-050); border:1px solid var(--blu-100); border-radius:9px; padding:14px 16px; margin-bottom:16px;">
      <div style="font-size:17px; font-weight:700; color:var(--blu-900); margin-bottom:4px;">${escapeHtml(f ? f.nome : 'Fornitore non disponibile')}</div>
      <div style="font-size:12px; color:var(--ardesia-500); text-transform:capitalize;">${dataFmt}</div>
    </div>
    <div style="padding:0 2px;">
      ${infoRow('Orario', `${oraDisplay} <span style="font-size:11px; color:var(--ardesia-400);">(${durataMin} min)</span>`)}
      ${infoRow('Tipo movimento', TIPO_LABEL[a.tipo])}
      ${ritardato ? infoRow('Ritardo accumulato', `+${a.ritardoMin} minuti`, 'var(--ambra)') : ''}
      ${infoRow('Referente', escapeHtml(f ? f.referente : '—'))}
      ${infoRow('Telefono', escapeHtml(f ? f.telefono : '—'))}
      ${infoRow('Email', `<span style="font-size:12px;">${escapeHtml(f ? f.email : '—')}</span>`)}
      ${infoRow('Stato', a.stato === 'confermato' ? '<span style="color:var(--verde);">● Confermato</span>' : '—')}
      ${infoRow('Creato da', escapeHtml(a.creatoDa || 'sistema'))}
    </div>
  `;

  document.getElementById('dettaglio-foot').innerHTML = `
    <button class="btn btn-ambra" id="det-btn-ritardo" data-appt-id="${a.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      Segnala ritardo
    </button>
    <button class="btn btn-danger" id="det-btn-cancella" data-appt-id="${a.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
      Cancella
    </button>
  `;

  document.getElementById('det-btn-ritardo').addEventListener('click', () => {
    closeModal('modal-dettaglio');
    setTimeout(() => openModalRitardo(apptId), 120);
  });
  document.getElementById('det-btn-cancella').addEventListener('click', () => {
    closeModal('modal-dettaglio');
    setTimeout(() => openModalCancella(apptId), 120);
  });

  document.getElementById('modal-dettaglio').classList.add('active');
}

function openModalCancella(apptId){
  pendingAction = { type:'cancella', apptId };
  const a = DATA.appuntamenti.find(x => x.id === apptId);
  const f = fornitoreById(a.fornitoreId);
  const dataFmt = new Date(a.data + 'T00:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
  document.getElementById('cancella-desc').innerHTML = `Stai per cancellare l'appuntamento di <b>${escapeHtml(f.nome)}</b> del ${dataFmt} alle ${a.oraOriginale} (${TIPO_LABEL[a.tipo]}). Il fornitore riceverà notifica immediata.`;
  document.getElementById('ca-pwd').value = '';
  document.getElementById('ca-pwd-error').style.display = 'none';
  document.getElementById('modal-cancella').classList.add('active');
}

document.getElementById('ca-confirm').addEventListener('click', async function(){
  const pwd = document.getElementById('ca-pwd').value;
  if (pwd !== '2580'){ document.getElementById('ca-pwd-error').style.display = 'block'; return; }
  const a = DATA.appuntamenti.find(x => x.id === pendingAction.apptId);
  const f = fornitoreById(a.fornitoreId);
  a.stato = 'cancellato';
  aggiungiLog('del',
    `Appuntamento di <b>${escapeHtml(f.nome)}</b> del ${a.data} alle ${a.oraOriginale} (${TIPO_LABEL[a.tipo]}) è stato cancellato dall'operatore.`,
    f.nome,
    [{ nome: f.nome, email: f.email, telefono: f.telefono }]
  );
  await saveData();
  closeModal('modal-cancella');
  showToast(`Appuntamento cancellato. Notifica inviata a ${f.nome}.`, 'rosso');
  renderView(currentView);
});

// ============================================================
// MODALS — RITARDO
// ============================================================

// Restituisce la fascia oraria ('mattina' | 'pomeriggio') di un orario dato
function fasciaOraria(ora){
  const min = timeToMin(ora);
  if (min >= timeToMin(FASCE.mattina.inizio) && min <= timeToMin(FASCE.mattina.fine)) return 'mattina';
  if (min >= timeToMin(FASCE.pomeriggio.inizio) && min <= timeToMin(FASCE.pomeriggio.fine)) return 'pomeriggio';
  return null;
}

function openModalRitardo(apptId){
  pendingAction = { type:'ritardo', apptId };
  const a = DATA.appuntamenti.find(x => x.id === apptId);
  const f = fornitoreById(a.fornitoreId);
  const fascia = fasciaOraria(a.oraOriginale);
  const successivi = DATA.appuntamenti.filter(x =>
    x.stato==='confermato' && x.data === a.data && x.id !== a.id &&
    timeToMin(x.oraOriginale) >= timeToMin(a.oraOriginale) &&
    fasciaOraria(x.oraOriginale) === fascia
  ).length;
  const fasciaLabel = fascia === 'mattina' ? 'della mattina' : 'del pomeriggio';
  const descSuccessivi = successivi > 0
    ? `Si propagherà sui successivi <b>${successivi}</b> appuntamenti ${fasciaLabel}.`
    : `Nessun appuntamento successivo ${fasciaLabel} da coinvolgere.`;
  document.getElementById('ritardo-desc').innerHTML =
    `Ritardo per <b>${escapeHtml(f.nome)}</b> (${a.oraOriginale}, ${TIPO_LABEL[a.tipo]}). ${descSuccessivi}`;
  document.getElementById('rt-minuti').value = '15';
  document.getElementById('modal-ritardo').classList.add('active');
}

document.getElementById('rt-confirm').addEventListener('click', async function(){
  const minuti = parseInt(document.getElementById('rt-minuti').value, 10);
  const a = DATA.appuntamenti.find(x => x.id === pendingAction.apptId);
  const f = fornitoreById(a.fornitoreId);
  const fascia = fasciaOraria(a.oraOriginale);
  // Propaga solo agli appuntamenti della stessa fascia (non attraversa la pausa pranzo)
  const coinvolti = DATA.appuntamenti.filter(x =>
    x.stato==='confermato' && x.data === a.data &&
    timeToMin(x.oraOriginale) >= timeToMin(a.oraOriginale) &&
    fasciaOraria(x.oraOriginale) === fascia
  ).sort((x,y) => timeToMin(x.oraOriginale) - timeToMin(y.oraOriginale));
  coinvolti.forEach(app => { app.ritardoMin += minuti; app.ora = addMinutes(app.oraOriginale, app.ritardoMin); });
  // Costruisco array fornitori unici con recapiti completi per il registro notifiche
  const fornitoriFull = [...new Map(coinvolti.map(x => {
    const ff = fornitoreById(x.fornitoreId);
    return [ff.id, { nome: ff.nome, email: ff.email, telefono: ff.telefono, oraOriginale: x.oraOriginale }];
  })).values()];
  const fasciaLabel = fascia === 'mattina' ? 'mattina' : 'pomeriggio';
  aggiungiLog('delay',
    `Ritardo di <b>${minuti} minuti</b> su <b>${escapeHtml(f.nome)}</b> (${a.data}, fascia ${fasciaLabel}). Propagato su ${coinvolti.length} appuntament${coinvolti.length===1?'o':'i'}.`,
    fornitoriFull.map(x => x.nome).join(', '),
    fornitoriFull
  );
  // Banner persistente in-app
  mostraBannerRitardo(minuti, fornitoriFull, a.data, fasciaLabel);
  await saveData();
  closeModal('modal-ritardo');
  showToast(`Ritardo +${minuti}m applicato a ${coinvolti.length} appuntament${coinvolti.length===1?'o':'i'} della ${fasciaLabel}.`, 'ambra');
  renderView(currentView);
});

// ============================================================
// ============================================================
// CHAT FORNITORI
// ============================================================
let chatFornitoreAttivo = null; // id fornitore della chat aperta

function initChat(){
  // Inizializza le chat nel DATA se non esistono
  if (!DATA.chat) DATA.chat = {};
  // Pre-popola alcune chat dimostrative per i primi fornitori
  const demo = DATA.fornitori.slice(0,4);
  demo.forEach((f, i) => {
    if (!DATA.chat[f.id]){
      const oraBase = Date.now() - (demo.length - i) * 3600000;
      DATA.chat[f.id] = { msgs: [
        { id: uid('msg'), da:'fornitore', testo: 'Buongiorno, confermo la consegna per domani alle ore indicate.', ts: oraBase },
        { id: uid('msg'), da:'magazzino', testo: 'Perfetto, grazie. La baia di carico sarà libera.', ts: oraBase + 600000 },
        { id: uid('msg'), da:'fornitore', testo: 'Ottimo, a domani!', ts: oraBase + 660000 }
      ]};
    }
  });
}

function renderChat(){
  initChat();
  const cont = document.getElementById('chat-content');
  if (chatFornitoreAttivo){
    renderChatWindow(chatFornitoreAttivo, cont);
  } else {
    renderChatList(cont);
  }
  aggiornaBadgeChat();
}

function renderChatList(cont){
  chatFornitoreAttivo = null;
  document.getElementById('chat-sub').textContent = 'Comunicazioni dirette con i fornitori';
  const righe = DATA.fornitori.map(f => {
    const msgs = (DATA.chat[f.id] && DATA.chat[f.id].msgs) || [];
    const ultimo = msgs[msgs.length-1];
    const nonLetti = msgs.filter(m => m.da==='fornitore' && !m.letto).length;
    const initials = f.nome.split(/[\s&,]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
    const ora = ultimo ? new Date(ultimo.ts).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : '';
    const preview = ultimo ? escapeHtml(ultimo.testo.slice(0,40) + (ultimo.testo.length>40?'…':'')) : '<em>Nessun messaggio</em>';
    return `
      <div class="chat-conv-row" data-chat-fid="${f.id}">
        <div class="chat-avatar" style="background:hsl(${f.id.charCodeAt(5)*37%360},45%,45%)">${initials}</div>
        <div class="chat-conv-info">
          <div class="chat-conv-name">${escapeHtml(f.nome)}</div>
          <div class="chat-conv-preview">${ultimo && ultimo.da==='magazzino' ? '✓ ' : ''}${preview}</div>
        </div>
        <div class="chat-conv-meta">
          ${ora ? `<span class="chat-conv-time">${ora}</span>` : ''}
          ${nonLetti > 0 ? `<span class="chat-unread">${nonLetti}</span>` : ''}
        </div>
      </div>`;
  }).join('');
  cont.innerHTML = `<div class="chat-list">${righe}</div>`;
  cont.querySelectorAll('[data-chat-fid]').forEach(el => {
    el.addEventListener('click', () => {
      chatFornitoreAttivo = el.dataset.chatFid;
      renderChat();
    });
  });
}

function renderChatWindow(fornitoreId, cont){
  const f = fornitoreById(fornitoreId);
  const chat = DATA.chat[fornitoreId] || { msgs: [] };
  // Segna come letti
  chat.msgs.forEach(m => { if(m.da==='fornitore') m.letto = true; });
  saveData();
  document.getElementById('chat-sub').textContent = escapeHtml(f ? f.nome : '—');

  const initials = f ? f.nome.split(/[\s&,]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') : '??';

  function fmtMsgTs(ts){
    const d = new Date(ts);
    const oggi = toDateStr(new Date());
    const giorno = toDateStr(d);
    const ora = d.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
    return giorno === oggi ? ora : d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'}) + ' ' + ora;
  }

  function buildMsgs(){
    let html = '';
    let lastDate = '';
    chat.msgs.forEach(m => {
      const d = new Date(m.ts);
      const giorno = toDateStr(d);
      if (giorno !== lastDate){
        const label = giorno === toDateStr(new Date()) ? 'Oggi' : d.toLocaleDateString('it-IT',{weekday:'long',day:'2-digit',month:'long'});
        html += `<div class="msg-system">${label}</div>`;
        lastDate = giorno;
      }
      const sent = m.da === 'magazzino';
      html += `
        <div class="msg-row ${sent ? 'sent' : 'recv'}">
          <div>
            <div class="msg-bubble">${escapeHtml(m.testo)}</div>
            <div class="msg-meta">${fmtMsgTs(m.ts)}${sent ? ' ✓' : ''}</div>
          </div>
        </div>`;
    });
    return html;
  }

  cont.innerHTML = `
    <div class="chat-window">
      <div class="chat-window-head">
        <button id="chat-back-btn" aria-label="Torna alla lista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <div class="chat-avatar" style="background:hsl(${fornitoreId.charCodeAt(5)*37%360},45%,45%); width:36px; height:36px; font-size:13px;">${initials}</div>
        <div class="info">
          <div class="name">${escapeHtml(f ? f.nome : '—')}</div>
          <div class="status">● Online</div>
        </div>
      </div>
      <div class="chat-messages" id="chat-msgs-area">${buildMsgs()}</div>
      <div class="chat-input-row">
        <input type="text" id="chat-input" placeholder="Scrivi un messaggio…" autocomplete="off">
        <button class="chat-send-btn" id="chat-send-btn" aria-label="Invia"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg></button>
      </div>
    </div>`;

  // Scroll in fondo
  const area = document.getElementById('chat-msgs-area');
  area.scrollTop = area.scrollHeight;

  document.getElementById('chat-back-btn').addEventListener('click', () => {
    chatFornitoreAttivo = null; renderChat();
  });

  function invia(){
    const inp = document.getElementById('chat-input');
    const testo = inp.value.trim();
    if (!testo) return;
    if (!DATA.chat[fornitoreId]) DATA.chat[fornitoreId] = { msgs: [] };
    const nuovo = { id: uid('msg'), da:'magazzino', testo, ts: Date.now(), letto: true };
    DATA.chat[fornitoreId].msgs.push(nuovo);
    inp.value = '';
    saveData();
    // Aggiorno solo i messaggi senza rifare tutta la finestra
    const row = document.createElement('div');
    row.className = 'msg-row sent';
    row.innerHTML = `<div><div class="msg-bubble">${escapeHtml(testo)}</div><div class="msg-meta">${new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} ✓</div></div>`;
    area.appendChild(row);
    area.scrollTop = area.scrollHeight;
    // Simula risposta automatica del fornitore dopo 2-4 secondi
    const risposte = [
      'Ricevuto, grazie per l\'aggiornamento.',
      'Ok, confermato!',
      'Capito, provvederemo immediatamente.',
      'Perfetto, saremo puntuali.',
      'Grazie dell\'avviso, ci organizziamo di conseguenza.'
    ];
    setTimeout(() => {
      if (DATA.chat[fornitoreId]){
        const risp = { id: uid('msg'), da:'fornitore', testo: risposte[Math.floor(Math.random()*risposte.length)], ts: Date.now(), letto: true };
        DATA.chat[fornitoreId].msgs.push(risp);
        saveData();
        const row2 = document.createElement('div');
        row2.className = 'msg-row recv';
        row2.innerHTML = `<div><div class="msg-bubble">${escapeHtml(risp.testo)}</div><div class="msg-meta">${new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div></div>`;
        const a = document.getElementById('chat-msgs-area');
        if(a){ a.appendChild(row2); a.scrollTop = a.scrollHeight; }
      }
    }, 2000 + Math.random()*2000);
  }

  document.getElementById('chat-send-btn').addEventListener('click', invia);
  document.getElementById('chat-input').addEventListener('keydown', (e) => { if(e.key==='Enter') invia(); });
}

function aggiornaBadgeChat(){
  if (!DATA.chat) return;
  const nonLetti = Object.values(DATA.chat).reduce((tot, c) => tot + (c.msgs||[]).filter(m=>m.da==='fornitore'&&!m.letto).length, 0);
  ['bn-badge-chat','sb-badge-chat'].forEach(id => {
    const el = document.getElementById(id);
    if(el){ el.textContent = nonLetti; el.style.display = nonLetti > 0 ? '' : 'none'; }
  });
}

// ============================================================
// BANNER RITARDO PERSISTENTE
// ============================================================
function mostraBannerRitardo(minuti, fornitoriFull, data, fasciaLabel){
  const container = document.getElementById('banner-container');
  if (!container) return;
  const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' });
  const ora = new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
  const bannerId = uid('banner');

  // Genera le righe per ogni fornitore e ogni canale
  const canaliHtml = fornitoriFull.map(ff => `
    <div style="margin-bottom:6px;">
      <div style="font-size:11px; font-weight:700; color:var(--ardesia-700); text-transform:uppercase; letter-spacing:0.03em; margin-bottom:4px; padding-left:2px;">${escapeHtml(ff.nome)} — ore ${ff.oraOriginale || '—'}</div>
      <div class="canale-row">
        <span class="canale-icon">📲</span>
        <span class="canale-nome">Push App</span>
        <span class="canale-dest">App fornitore</span>
        <span class="canale-ok">✓ Inviata</span>
      </div>
      <div class="canale-row">
        <span class="canale-icon">✉️</span>
        <span class="canale-nome">Email</span>
        <span class="canale-dest" style="max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(ff.email||'—')}</span>
        <span class="canale-ok">✓ Inviata</span>
      </div>
      <div class="canale-row">
        <span class="canale-icon">💬</span>
        <span class="canale-nome">WhatsApp</span>
        <span class="canale-dest">${escapeHtml(ff.telefono||'—')}</span>
        <span class="canale-ok">✓ Inviata</span>
      </div>
    </div>
  `).join('');

  const banner = document.createElement('div');
  banner.className = 'banner-ritardo';
  banner.id = bannerId;
  banner.innerHTML = `
    <div class="banner-ritardo-head">
      <div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>
      <div class="tit">
        Ritardo +${minuti} min — ${fasciaLabel}
        <small>${dataFmt} · Notifiche inviate alle ${ora}</small>
      </div>
      <button class="close-btn" aria-label="Chiudi banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>
    <div class="banner-canali">${canaliHtml}</div>
    <div class="banner-reg-link" id="link-reg-${bannerId}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
      Vai al registro notifiche completo
    </div>
  `;
  banner.querySelector('.close-btn').addEventListener('click', () => banner.remove());
  banner.querySelector(`#link-reg-${bannerId}`).addEventListener('click', () => switchView('registro'));
  container.prepend(banner);
}

// ============================================================
// MODAL HELPERS
// ============================================================
document.querySelectorAll('[data-close]').forEach(btn => { btn.addEventListener('click', () => closeModal(btn.dataset.close)); });
document.querySelectorAll('.modal-overlay').forEach(ov => { ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(ov.id); }); });
function closeModal(id){ document.getElementById(id).classList.remove('active'); pendingAction = null; }

// ============================================================
// SWIPE TO DISMISS — gesture standard iOS su tutti i bottom sheet
// ============================================================
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  const modal = overlay.querySelector('.modal');
  if (!modal) return;
  let startY = 0, startTime = 0, dragging = false, currentY = 0;
  const DISMISS_THRESHOLD = 100; // px verso il basso per chiudere
  const VELOCITY_THRESHOLD = 0.4; // px/ms — swipe veloce anche con piccolo spostamento

  function getY(e){ return e.touches ? e.touches[0].clientY : e.clientY; }

  function onStart(e){
    // Parti solo dalla zona superiore del modal (grabber + header) o se scroll è a 0
    const target = e.target;
    const isGrabberArea = target.closest('.modal-grabber') || target.closest('.modal-head');
    if (!isGrabberArea && modal.scrollTop > 0) return; // contenuto scrollato: non intercettare
    startY = getY(e);
    startTime = e.timeStamp;
    currentY = 0;
    dragging = true;
    modal.style.transition = 'none';
  }

  function onMove(e){
    if (!dragging) return;
    const deltaY = getY(e) - startY;
    if (deltaY <= 0){ modal.style.transform = ''; return; } // solo verso il basso
    // Resistenza elastica: rende la gesture più naturale
    currentY = deltaY * (1 - Math.min(deltaY / 800, 0.45));
    modal.style.transform = `translateY(${currentY}px)`;
    if (e.cancelable) e.preventDefault();
  }

  function onEnd(e){
    if (!dragging) return;
    dragging = false;
    const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const deltaY = endY - startY;
    const elapsed = e.timeStamp - startTime;
    const velocity = elapsed > 0 ? deltaY / elapsed : 0;
    const shouldDismiss = deltaY > DISMISS_THRESHOLD || (deltaY > 30 && velocity > VELOCITY_THRESHOLD);

    if (shouldDismiss){
      modal.style.transition = 'transform 0.26s cubic-bezier(0.32,0.72,0,1)';
      modal.style.transform = 'translateY(100%)';
      setTimeout(() => {
        modal.style.transform = '';
        modal.style.transition = '';
        closeModal(overlay.id);
      }, 270);
    } else {
      modal.style.transition = 'transform 0.22s cubic-bezier(0.22,1,0.36,1)';
      modal.style.transform = '';
      setTimeout(() => { modal.style.transition = ''; }, 220);
    }
  }

  modal.addEventListener('touchstart', onStart, { passive: true });
  modal.addEventListener('touchmove', onMove, { passive: false });
  modal.addEventListener('touchend', onEnd, { passive: true });
  // Supporto mouse per test desktop
  modal.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', (e) => { if(dragging) onMove(e); });
  document.addEventListener('mouseup', (e) => { if(dragging) onEnd(e); });
});


// ─────────────────────────────────────────────────────────────
// AVVIO — la pagina e' gia' autenticata da index.html
// ─────────────────────────────────────────────────────────────
function init(){
  var sess = MGC.Session.require(2);
  if (!sess) return;                    // sessione assente -> redirect al login

  document.getElementById('app').classList.add('active');

  DATA = MGC.Store.ensure();

  var user = sess.username || 'm.rossi';
  currentUser = { username: user, nome: user, ruolo: 'Operatore Magazzino' };
  var ini = user.split(/[.\s]/).filter(Boolean).slice(0,2)
                .map(function(s){ return s[0].toUpperCase(); }).join('') || 'MR';

  ['sb-user-avatar','user-avatar-mobile','account-avatar'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = ini;
  });
  ['sb-user-name','account-name'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = user;
  });

  currentDate = toDateStr(new Date());
  saveData();
  switchView('agenda');
}

init();

})();
