/* ============================================================
   LIVELLO 3 — Guardiola
   ------------------------------------------------------------
   Sola lettura: mostra gli appuntamenti confermati del giorno
   e permette di cercare un fornitore. Nessuna modifica ai dati.
   ============================================================ */
(function () {
  'use strict';

  var U = MGC.Utils;
  var TIPO_LABEL = U.TIPO_LABEL;

  var DATA = null;
  var currentDate = null;
  var currentView = 'oggi';

  var $ = function (sel) { return document.querySelector(sel); };

  /* =========================================================
     HELPER DI PRESENTAZIONE
     ========================================================= */
  function pillTipo(a) {
    if (a.tipo === 'eccezionale') return '<span class="pill pill-ecc">Eccezionale</span>';
    if (a.tipo === 'carico')      return '<span class="pill pill-carico">Carico</span>';
    if (a.tipo === 'scarico')     return '<span class="pill pill-scarico">Scarico</span>';
    return '<span class="pill pill-entrambi">Carico/Scarico</span>';
  }

  function iniziali(nome) {
    return nome.split(/[\s&,]+/).filter(Boolean).slice(0, 2)
               .map(function (w) { return w[0].toUpperCase(); }).join('');
  }

  function apptDelGiorno(dateStr) {
    return DATA.appuntamenti
      .filter(function (a) { return a.data === dateStr && a.stato === 'confermato'; })
      .sort(function (a, b) { return U.timeToMin(a.ora) - U.timeToMin(b.ora); });
  }

  function oraCorrente() {
    var d = new Date();
    return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  }

  /* =========================================================
     PAGINA OGGI
     ========================================================= */
  function renderOggi() {
    var lista = apptDelGiorno(currentDate);
    var oggiStr = U.toDateStr(new Date());
    var isOggi = currentDate === oggiStr;

    /* intestazione giorno */
    var d = new Date(currentDate + 'T00:00:00');
    $('#d-label').textContent = d.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long' });
    $('#d-sub').textContent = isOggi ? 'Oggi' : d.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });

    /* statistiche */
    var ritardi = lista.filter(function (a) { return a.ritardoMin > 0; }).length;
    var ora = oraCorrente();
    var attesi = isOggi
      ? lista.filter(function (a) { return U.timeToMin(a.ora) >= U.timeToMin(ora); }).length
      : lista.length;

    $('#stats').innerHTML =
      statBox('Ingressi', lista.length, 'confermati', '') +
      statBox('Attesi', attesi, isOggi ? 'da qui a fine giornata' : 'in programma', 'verde') +
      statBox('In ritardo', ritardi, ritardi ? 'segnalati' : 'nessuno', ritardi ? 'amb' : '');

    /* prossimo in arrivo (solo per oggi) */
    var box = $('#next-box');
    if (isOggi) {
      var prossimo = lista.filter(function (a) { return U.timeToMin(a.ora) >= U.timeToMin(ora); })[0];
      if (prossimo) {
        var f = MGC.Store.fornitoreById(DATA, prossimo.fornitoreId);
        box.innerHTML =
          '<div class="next">' +
            '<div class="k">Prossimo in arrivo</div>' +
            '<div class="row"><div class="ora">' + prossimo.ora + '</div>' +
              '<div class="nome">' + U.escapeHtml(f ? f.nome : 'Fornitore non disponibile') + '</div></div>' +
            '<div class="meta">' + TIPO_LABEL[prossimo.tipo] +
              (prossimo.ritardoMin > 0 ? ' · in ritardo di ' + prossimo.ritardoMin + ' min (previsto ' + prossimo.oraOriginale + ')' : '') +
              (f && f.referente ? ' · ' + U.escapeHtml(f.referente) : '') +
            '</div>' +
          '</div>';
      } else {
        box.innerHTML = '';
      }
    } else {
      box.innerHTML = '';
    }

    /* lista divisa per fascia */
    var mattina = lista.filter(function (a) { return U.fasciaOraria(a.ora) === 'mattina'; });
    var pomeriggio = lista.filter(function (a) { return U.fasciaOraria(a.ora) !== 'mattina'; });

    var html = '';
    if (lista.length === 0) {
      html = '<div class="vuoto">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
        '<div>Nessun ingresso previsto in questa giornata.</div></div>';
    } else {
      html += sezione('Mattina', U.FASCE.mattina.inizio + ' — ' + U.FASCE.mattina.fine, mattina, isOggi);
      html += sezione('Pomeriggio', U.FASCE.pomeriggio.inizio + ' — ' + U.FASCE.pomeriggio.fine, pomeriggio, isOggi);
    }
    $('#lista-oggi').innerHTML = html;
  }

  function statBox(k, v, s, cls) {
    return '<div class="stat"><div class="k">' + k + '</div>' +
           '<div class="v ' + (cls || '') + '">' + v + '</div>' +
           '<div class="s">' + s + '</div></div>';
  }

  function sezione(titolo, orario, lista, isOggi) {
    var icona = titolo === 'Mattina'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>';

    var righe = lista.map(function (a) { return rigaAppt(a, isOggi); }).join('');
    if (!righe) righe = '<div class="vuoto" style="padding:18px;">Nessun ingresso in questa fascia.</div>';

    return '<div class="fascia">' + icona + '<span class="t">' + titolo + '</span>' +
           '<span class="o">' + orario + '</span></div>' + righe;
  }

  function rigaAppt(a, isOggi) {
    var f = MGC.Store.fornitoreById(DATA, a.fornitoreId);
    var ritardato = a.ritardoMin > 0;
    var passato = isOggi && U.timeToMin(a.ora) < U.timeToMin(oraCorrente());
    var cls = 'appt' + (a.tipo === 'eccezionale' ? ' ecc' : ritardato ? ' rit' : '') + (passato ? ' passato' : '');

    return '<button class="' + cls + '" data-appt="' + a.id + '">' +
      '<div class="ora">' + a.ora + (ritardato ? '<small>+' + a.ritardoMin + 'm</small>' : '') + '</div>' +
      '<div class="mid">' +
        '<div class="nome">' + U.escapeHtml(f ? f.nome : 'Fornitore non disponibile') + '</div>' +
        '<div class="sub">' + pillTipo(a) +
          (ritardato ? '<span class="pill pill-rit">Ritardo</span>' : '') +
          (f && f.referente ? U.escapeHtml(f.referente) : '') +
        '</div>' +
      '</div>' +
      '<div class="chev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg></div>' +
      '</button>';
  }

  /* =========================================================
     PAGINA CERCA
     ========================================================= */
  function renderCerca() {
    var q = ($('#q').value || '').trim().toLowerCase();
    var oggiStr = U.toDateStr(new Date());
    var cont = $('#risultati');

    if (q.length < 2) {
      cont.innerHTML = '<div class="vuoto">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<div>Digita almeno due lettere del nome del fornitore.</div></div>';
      return;
    }

    var trovati = DATA.fornitori.filter(function (f) {
      return f.nome.toLowerCase().indexOf(q) !== -1 ||
             (f.referente || '').toLowerCase().indexOf(q) !== -1;
    });

    if (!trovati.length) {
      cont.innerHTML = '<div class="vuoto">Nessun fornitore corrisponde a “' + U.escapeHtml(q) + '”.</div>';
      return;
    }

    cont.innerHTML = trovati.map(function (f) {
      var futuri = DATA.appuntamenti.filter(function (a) {
        return a.fornitoreId === f.id && a.stato === 'confermato' && a.data >= oggiStr;
      }).sort(function (a, b) { return (a.data + a.ora).localeCompare(b.data + b.ora); });

      var p = futuri[0];
      var sub = p
        ? (p.data === oggiStr ? 'Oggi alle ' + p.ora : U.fmtDateShort(p.data) + ' alle ' + p.ora) + ' · ' + TIPO_LABEL[p.tipo]
        : 'Nessun appuntamento in programma';

      return '<button class="forn" data-forn="' + f.id + '">' +
        '<div class="av">' + iniziali(f.nome) + '</div>' +
        '<div class="mid">' +
          '<div class="nome">' + U.escapeHtml(f.nome) + '</div>' +
          '<div class="sub">' + U.escapeHtml(sub) + '</div>' +
        '</div>' +
        '<div class="cnt">' + futuri.length + '</div>' +
        '</button>';
    }).join('');
  }

  /* =========================================================
     DETTAGLIO
     ========================================================= */
  function irow(k, v, cls) {
    return '<div class="irow"><span class="k">' + k + '</span><span class="v ' + (cls || '') + '">' + v + '</span></div>';
  }

  function apriDettaglioAppt(id) {
    var a = DATA.appuntamenti.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var f = MGC.Store.fornitoreById(DATA, a.fornitoreId);
    var ritardato = a.ritardoMin > 0;

    $('#dett-body').innerHTML =
      '<div style="font-family:var(--serif);font-size:18px;font-weight:700;color:var(--blu-900);margin-bottom:4px;">' +
        U.escapeHtml(f ? f.nome : 'Fornitore non disponibile') + '</div>' +
      '<div style="font-size:12.5px;color:var(--ardesia-500);margin-bottom:12px;">' + U.fmtDateLong(a.data) + '</div>' +
      irow('Orario previsto', ritardato ? a.oraOriginale + ' → <b>' + a.ora + '</b>' : '<b>' + a.ora + '</b>', ritardato ? 'amb' : '') +
      (ritardato ? irow('Ritardo segnalato', '+' + a.ritardoMin + ' minuti', 'amb') : '') +
      irow('Tipo movimento', TIPO_LABEL[a.tipo]) +
      irow('Durata', U.durataAppuntamento(a.tipo) + ' minuti') +
      irow('Referente', f && f.referente ? U.escapeHtml(f.referente) : '—') +
      irow('Telefono', f && f.telefono ? U.escapeHtml(f.telefono) : '—') +
      irow('Codice fornitore', a.fornitoreId);

    $('#dett-call').innerHTML = (f && f.telefono)
      ? '<a class="call" href="tel:' + f.telefono.replace(/\s/g, '') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>' +
        'Chiama il referente</a>'
      : '';

    $('#ov-dett').classList.add('active');
  }

  function apriDettaglioFornitore(id) {
    var f = MGC.Store.fornitoreById(DATA, id);
    if (!f) return;
    var oggiStr = U.toDateStr(new Date());
    var futuri = DATA.appuntamenti.filter(function (a) {
      return a.fornitoreId === id && a.stato === 'confermato' && a.data >= oggiStr;
    }).sort(function (a, b) { return (a.data + a.ora).localeCompare(b.data + b.ora); }).slice(0, 8);

    var righe = futuri.length
      ? futuri.map(function (a) {
          return irow(a.data === oggiStr ? 'Oggi' : U.fmtDateShort(a.data),
                      a.ora + ' · ' + TIPO_LABEL[a.tipo] + (a.ritardoMin > 0 ? ' (+' + a.ritardoMin + 'm)' : ''),
                      a.ritardoMin > 0 ? 'amb' : '');
        }).join('')
      : '<div style="padding:14px 0;color:var(--ardesia-400);font-size:13.5px;">Nessun appuntamento in programma.</div>';

    $('#dett-body').innerHTML =
      '<div style="font-family:var(--serif);font-size:18px;font-weight:700;color:var(--blu-900);margin-bottom:4px;">' +
        U.escapeHtml(f.nome) + '</div>' +
      '<div style="font-size:12.5px;color:var(--ardesia-500);margin-bottom:12px;">' +
        U.escapeHtml(f.referente || '') + (f.telefono ? ' · ' + U.escapeHtml(f.telefono) : '') + '</div>' +
      '<div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ardesia-400);margin-bottom:2px;">Prossimi ingressi</div>' +
      righe;

    $('#dett-call').innerHTML = f.telefono
      ? '<a class="call" href="tel:' + f.telefono.replace(/\s/g, '') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>' +
        'Chiama il referente</a>'
      : '';

    $('#ov-dett').classList.add('active');
  }

  function chiudiDettaglio() { $('#ov-dett').classList.remove('active'); }

  /* =========================================================
     NAVIGAZIONE
     ========================================================= */
  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.page-l3').forEach(function (p) { p.classList.remove('active'); });
    $('#page-' + view).classList.add('active');
    document.querySelectorAll('.bn-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    window.scrollTo(0, 0);
    if (view === 'oggi') renderOggi(); else renderCerca();
  }

  function shiftDay(delta) {
    var d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    currentDate = U.toDateStr(d);
    renderOggi();
  }

  /* =========================================================
     EVENTI
     ========================================================= */
  function collegaEventi() {
    $('#btn-esci').addEventListener('click', function () { MGC.Session.logout(); });

    $('#d-prev').addEventListener('click', function () { shiftDay(-1); });
    $('#d-next').addEventListener('click', function () { shiftDay(1); });
    $('#d-oggi').addEventListener('click', function () {
      currentDate = U.toDateStr(new Date());
      renderOggi();
    });

    document.querySelectorAll('.bn-item').forEach(function (b) {
      b.addEventListener('click', function () { switchView(b.dataset.view); });
    });

    $('#lista-oggi').addEventListener('click', function (e) {
      var el = e.target.closest('[data-appt]');
      if (el) apriDettaglioAppt(el.dataset.appt);
    });
    $('#next-box').addEventListener('click', function () {
      var lista = apptDelGiorno(currentDate);
      var p = lista.filter(function (a) { return U.timeToMin(a.ora) >= U.timeToMin(oraCorrente()); })[0];
      if (p) apriDettaglioAppt(p.id);
    });
    $('#risultati').addEventListener('click', function (e) {
      var el = e.target.closest('[data-forn]');
      if (el) apriDettaglioFornitore(el.dataset.forn);
    });

    var q = $('#q');
    q.addEventListener('input', renderCerca);

    $('#ov-dett').addEventListener('click', function (e) {
      if (e.target === this || e.target.closest('[data-close]')) chiudiDettaglio();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') chiudiDettaglio();
    });
  }

  /* =========================================================
     AVVIO
     ========================================================= */
  function init() {
    var sess = MGC.Session.require(3);
    if (!sess) return;

    DATA = MGC.Store.ensure();
    currentDate = U.toDateStr(new Date());

    document.getElementById('app-l3').classList.add('active');
    collegaEventi();
    switchView('oggi');

    /* la guardiola tiene la pagina aperta tutto il giorno:
       ricarica i dati e l'ora ogni 60 secondi */
    setInterval(function () {
      var fresh = MGC.Store.load();
      if (fresh) DATA = fresh;
      if (currentView === 'oggi') renderOggi();
    }, 60000);
  }

  init();

})();
