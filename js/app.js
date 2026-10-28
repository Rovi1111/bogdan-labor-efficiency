/**
 * app.js — интерфейс: ввод данных, хранение, отрисовка таблиц, графиков и сценариев.
 * Все вычисления делегируются чистым функциям из calc.js (window.Calc).
 */
(function () {
  'use strict';

  const Calc = window.Calc;
  const STORAGE_KEY = 'bogdan-labor-efficiency:v1';

  // ---------------------------------------------------------------------------
  // Исходные данные
  // ---------------------------------------------------------------------------

  /**
   * Условный пример: умеренный рост выручки, численности и зарплат.
   * В 3 кв. 2025 и 1 кв. 2026 рост ЗП опережает производительность (красный статус),
   * в 4 кв. 2025 темпы почти равны (жёлтый), в 1 кв. 2026 прибыль отрицательная.
   */
  const EXAMPLE_ROWS = [
    { label: '1 кв. 2025', revenue: 48000000, profit: 3600000, fot: 9600000, headcount: 40 },
    { label: '2 кв. 2025', revenue: 51500000, profit: 4100000, fot: 10000000, headcount: 41 },
    { label: '3 кв. 2025', revenue: 54000000, profit: 4300000, fot: 11200000, headcount: 42 },
    { label: '4 кв. 2025', revenue: 60500000, profit: 4600000, fot: 12600000, headcount: 43 },
    { label: '1 кв. 2026', revenue: 58000000, profit: -400000, fot: 13000000, headcount: 44 },
    { label: '2 кв. 2026', revenue: 63800000, profit: 4800000, fot: 13300000, headcount: 45 },
  ];

  const DEFAULT_SCENARIO = { wage: 0, headcount: 0, revenue: 0, margin: 30 };

  function exampleState() {
    return {
      periodType: 'quarter',
      rows: EXAMPLE_ROWS.map(function (r) { return Object.assign({}, r); }),
      insurance: { enabled: false, rate: 30 },
      benchmark: 4.5,
      isExample: true,
      scenario: Object.assign({}, DEFAULT_SCENARIO),
    };
  }

  const NUM_FIELDS = ['revenue', 'profit', 'fot', 'headcount'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const PERIOD_WORD = { month: 'месяц', quarter: 'квартал', year: 'год' };

  // ---------------------------------------------------------------------------
  // Хранение (localStorage может быть недоступен — всё обёрнуто в try/catch)
  // ---------------------------------------------------------------------------

  function numOrNull(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return exampleState();
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.rows)) return exampleState();
      return {
        periodType: PERIOD_WORD[s.periodType] ? s.periodType : 'quarter',
        rows: s.rows.map(function (r) {
          return {
            label: String(r.label == null ? '' : r.label),
            revenue: numOrNull(r.revenue),
            profit: numOrNull(r.profit),
            fot: numOrNull(r.fot),
            headcount: numOrNull(r.headcount),
          };
        }),
        insurance: {
          enabled: !!(s.insurance && s.insurance.enabled),
          rate: numOrNull(s.insurance && s.insurance.rate) ?? 30,
        },
        benchmark: numOrNull(s.benchmark),
        isExample: !!s.isExample,
        scenario: Object.assign({}, DEFAULT_SCENARIO, s.scenario || {}),
      };
    } catch (e) {
      return exampleState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* приватный режим или запрет хранилища — работаем без сохранения */
    }
  }

  let state = loadState();

  // ---------------------------------------------------------------------------
  // Форматирование и разбор чисел (русская локаль)
  // ---------------------------------------------------------------------------

  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfIn = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const MINUS = '−';
  const NBSP = ' ';

  function sign(v) { return v > 0 ? '+' : v < 0 ? MINUS : ''; }
  const fmt = {
    money: function (v) { return sign(v).replace('+', '') + nf0.format(Math.abs(v)) + NBSP + '₽'; },
    coef: function (v) { return sign(v).replace('+', '') + nf2.format(Math.abs(v)); },
    pct: function (v) { return sign(v).replace('+', '') + nf1.format(Math.abs(v)) + NBSP + '%'; },
    people: function (v) { return nfIn.format(v); },
  };
  /** Знаковая разница в единицах показателя. */
  const fmtDelta = {
    money: function (d) { return sign(d) + nf0.format(Math.abs(d)) + NBSP + '₽'; },
    coef: function (d) { return sign(d) + nf2.format(Math.abs(d)); },
    pct: function (d) { return sign(d) + nf1.format(Math.abs(d)) + NBSP + 'п.п.'; },
    people: function (d) { return sign(d) + nfIn.format(Math.abs(d)); },
  };
  function fmtSignedPct(v) { return sign(v) + nf1.format(Math.abs(v)) + NBSP + '%'; }

  /** Разбор пользовательского ввода: «1 234 567,8», «−5000». Пустое → null, ошибка → NaN. */
  function parseNum(str) {
    const s = String(str).replace(/[\s  ]/g, '').replace(',', '.').replace(MINUS, '-');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** «—» с подсказкой о причине. */
  function dash(reason) {
    return '<span class="dash" title="' + escapeHtml(reason || 'Нет данных') + '">—</span>' +
      (reason ? '<span class="hint">' + escapeHtml(reason) + '</span>' : '');
  }

  // ---------------------------------------------------------------------------
  // Подсказки к показателям
  // ---------------------------------------------------------------------------

  const TIPS = {
    revPerFot: { title: 'Выручка на 1 ₽ ФОТ', formula: 'Выручка / ФОТ',
      text: 'Сколько рублей выручки приносит каждый рубль, потраченный на оплату труда. Рост — хорошо: персонал работает отдачливее.' },
    profitPerFot: { title: 'Прибыль на 1 ₽ ФОТ', formula: 'Прибыль / ФОТ',
      text: 'Сколько прибыли приходится на рубль ФОТ. Отрицательное значение — расходы на персонал не окупаются результатом периода.' },
    fotShare: { title: 'Доля ФОТ в выручке', formula: 'ФОТ / Выручка × 100 %',
      text: 'Какая часть выручки уходит на оплату труда. Снижение доли при росте зарплат — признак эффективного повышения.' },
    productivity: { title: 'Производительность труда', formula: 'Выручка / Численность',
      text: 'Выручка на одного работника за период.' },
    avgWage: { title: 'Средняя заработная плата', formula: 'ФОТ / Численность',
      text: 'Средние затраты на оплату труда одного работника за период (с взносами, если они включены).' },
    ipt: { title: 'Индекс производительности (Iпт)', formula: 'Произв. текущая / Произв. предыдущая',
      text: 'Во сколько раз изменилась производительность к предыдущему периоду. 1,05 = рост на 5 %.' },
    izp: { title: 'Индекс средней ЗП (Iзп)', formula: 'Ср. ЗП текущая / Ср. ЗП предыдущая',
      text: 'Во сколько раз изменилась средняя зарплата к предыдущему периоду.' },
    lead: { title: 'Коэффициент опережения', formula: 'Iпт / Iзп',
      text: 'Больше 1 — производительность растёт быстрее зарплаты, повышение оправдано. 0,95–1 — зона внимания. Меньше 0,95 — рост зарплаты не подкреплён ростом производительности.' },
    insurance: { title: 'Страховые взносы', formula: 'ФОТ × (1 + ставка)',
      text: 'Если включено, во всех расчётах используется ФОТ с начисленными страховыми взносами — полные затраты работодателя на персонал.' },
    benchmark: { title: 'Отраслевой ориентир', formula: 'Выручка / ФОТ по отрасли',
      text: 'Необязательное значение для сравнения. Показывается на графике пунктирной линией.' },
    margin: { title: 'Маржинальность', formula: 'Прибыль сц. = Прибыль факт + ΔВыручки × маржинальность − ΔФОТ',
      text: 'Какая доля прироста выручки остаётся в виде прибыли до вычета дополнительных затрат на персонал. Упрощённая модель.' },
    maxWage: { title: 'Допустимое повышение ЗП', formula: 'ΔЗП ≤ (1 + ΔВыручки) / (1 + ΔЧисленности) − 1',
      text: 'Максимальный рост средней зарплаты, при котором коэффициент опережения остаётся ≥ 1. Ставка взносов на результат не влияет.' },
  };

  function tipBtn(key) {
    return '<button type="button" class="tip" data-tip="' + key + '" aria-label="Пояснение">?</button>';
  }

  const tooltipEl = document.getElementById('tooltip');
  let tipPinned = null;

  function showTip(btn) {
    const t = TIPS[btn.dataset.tip];
    if (!t) return;
    tooltipEl.innerHTML = '<b>' + escapeHtml(t.title) + '</b><span class="formula">' +
      escapeHtml(t.formula) + '</span>' + escapeHtml(t.text);
    tooltipEl.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = tooltipEl.offsetWidth, h = tooltipEl.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }
  function hideTip() {
    tooltipEl.hidden = true;
    if (tipPinned) tipPinned.setAttribute('aria-expanded', 'false');
    tipPinned = null;
  }

  // Делегирование: подсказки работают и для динамически созданных кнопок.
  document.addEventListener('mouseover', function (e) {
    const b = e.target.closest('.tip');
    if (b && !tipPinned) showTip(b);
  });
  document.addEventListener('mouseout', function (e) {
    const b = e.target.closest('.tip');
    if (b && !tipPinned) tooltipEl.hidden = true;
  });
  document.addEventListener('focusin', function (e) {
    const b = e.target.closest('.tip');
    if (b) showTip(b);
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.closest('.tip')) hideTip();
  });
  document.addEventListener('click', function (e) {
    const b = e.target.closest('.tip');
    if (b) {
      // На сенсорных экранах подсказка открывается и закрывается нажатием.
      if (tipPinned === b) { hideTip(); return; }
      hideTip();
      tipPinned = b;
      b.setAttribute('aria-expanded', 'true');
      showTip(b);
    } else if (tipPinned) {
      hideTip();
    }
  });
  window.addEventListener('scroll', function () { if (!tooltipEl.hidden) hideTip(); }, { passive: true });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });

  // ---------------------------------------------------------------------------
  // Таблица ввода
  // ---------------------------------------------------------------------------

  const els = {
    body: document.getElementById('input-body'),
    error: document.getElementById('input-error'),
    exampleNote: document.getElementById('example-note'),
    periodType: document.getElementById('period-type'),
    insEnabled: document.getElementById('ins-enabled'),
    insRate: document.getElementById('ins-rate'),
    benchmark: document.getElementById('benchmark'),
  };

  /** Проверка одного значения: возвращает текст ошибки или ''. */
  function validateField(field, value) {
    if (Number.isNaN(value)) return 'не число';
    if (value == null) return '';
    if (field === 'headcount' && value <= 0) return 'численность должна быть > 0';
    if ((field === 'revenue' || field === 'fot') && value < 0) return 'значение должно быть ≥ 0';
    return '';
  }

  function isComplete(row) {
    return row && NUM_FIELDS.every(function (f) { return row[f] != null; });
  }

  function inputValue(field, v) {
    return v == null ? '' : nfIn.format(v);
  }

  function renderInputTable() {
    if (state.rows.length === 0) {
      els.body.innerHTML = '<tr><td colspan="6" class="muted">Нет данных. Нажмите «Добавить период».</td></tr>';
      return;
    }
    els.body.innerHTML = state.rows.map(function (row, i) {
      const cells = NUM_FIELDS.map(function (f) {
        return '<td><input type="text" class="num" inputmode="decimal" data-i="' + i + '" data-f="' + f +
          '" value="' + escapeHtml(inputValue(f, row[f])) + '" aria-label="' + fieldName(f) + ', строка ' + (i + 1) + '"></td>';
      }).join('');
      return '<tr><td><input type="text" data-i="' + i + '" data-f="label" value="' + escapeHtml(row.label) +
        '" aria-label="Период, строка ' + (i + 1) + '"></td>' + cells +
        '<td><button type="button" class="icon-btn" data-del="' + i + '" title="Удалить строку" aria-label="Удалить строку ' +
        (i + 1) + '">×</button></td></tr>';
    }).join('');
  }

  function fieldName(f) {
    return { revenue: 'Выручка', profit: 'Прибыль', fot: 'ФОТ', headcount: 'Численность' }[f];
  }

  /** Собирает ошибки ввода из DOM-полей, помеченных как invalid. */
  function refreshErrorText() {
    const bad = els.body.querySelectorAll('input.invalid');
    els.error.textContent = bad.length
      ? 'Есть некорректные значения (' + bad.length + '): ' + bad[0].title + '. Такие ячейки не участвуют в расчёте.'
      : '';
  }

  els.body.addEventListener('input', function (e) {
    const inp = e.target;
    const i = Number(inp.dataset.i), f = inp.dataset.f;
    if (!state.rows[i]) return;
    if (f === 'label') {
      state.rows[i].label = inp.value;
    } else {
      const v = parseNum(inp.value);
      const err = validateField(f, v);
      inp.classList.toggle('invalid', !!err);
      inp.title = err ? fieldName(f) + ': ' + err : '';
      state.rows[i][f] = err ? null : v;
      refreshErrorText();
    }
    markEdited();
    update();
  });

  // При потере фокуса приводим число к виду «1 234 567».
  els.body.addEventListener('focusout', function (e) {
    const inp = e.target;
    const f = inp.dataset && inp.dataset.f;
    if (!f || f === 'label' || inp.classList.contains('invalid')) return;
    const row = state.rows[Number(inp.dataset.i)];
    if (row) inp.value = inputValue(f, row[f]);
  });

  els.body.addEventListener('click', function (e) {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    state.rows.splice(Number(b.dataset.del), 1);
    markEdited();
    renderInputTable();
    refreshErrorText();
    update();
  });

  /** Подпись следующего периода по подписи последнего и типу периода. */
  function nextLabel() {
    const last = state.rows.length ? state.rows[state.rows.length - 1].label.trim() : '';
    const type = state.periodType;
    const year = new Date().getFullYear();
    let m;
    if (type === 'quarter') {
      m = last.match(/^([1-4])\s*кв\.?\s*(\d{4})/i);
      if (m) {
        const q = Number(m[1]), y = Number(m[2]);
        return q === 4 ? '1 кв. ' + (y + 1) : (q + 1) + ' кв. ' + y;
      }
      return last ? 'Период ' + (state.rows.length + 1) : '1 кв. ' + year;
    }
    if (type === 'month') {
      m = last.match(/^([А-Яа-яЁё]+)\s+(\d{4})/);
      const idx = m ? MONTHS.findIndex(function (n) { return n.toLowerCase() === m[1].toLowerCase(); }) : -1;
      if (idx >= 0) {
        const y = Number(m[2]);
        return idx === 11 ? MONTHS[0] + ' ' + (y + 1) : MONTHS[idx + 1] + ' ' + y;
      }
      return last ? 'Период ' + (state.rows.length + 1) : MONTHS[0] + ' ' + year;
    }
    m = last.match(/^(\d{4})/);
    if (m) return String(Number(m[1]) + 1);
    return last ? 'Период ' + (state.rows.length + 1) : String(year);
  }

  document.getElementById('btn-add').addEventListener('click', function () {
    state.rows.push({ label: nextLabel(), revenue: null, profit: null, fot: null, headcount: null });
    markEdited();
    renderInputTable();
    update();
    const inputs = els.body.querySelectorAll('tr:last-child input');
    if (inputs[1]) inputs[1].focus();
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    if (!confirm('Заменить текущие данные условным примером?')) return;
    state = exampleState();
    initControls();
  });

  document.getElementById('btn-clear').addEventListener('click', function () {
    if (!confirm('Удалить все периоды и настройки?')) return;
    state = {
      periodType: state.periodType,
      rows: [],
      insurance: { enabled: false, rate: 30 },
      benchmark: null,
      isExample: false,
      scenario: Object.assign({}, DEFAULT_SCENARIO),
    };
    initControls();
  });

  function markEdited() {
    if (state.isExample) {
      state.isExample = false;
      els.exampleNote.hidden = true;
    }
  }

  els.periodType.addEventListener('change', function () {
    state.periodType = els.periodType.value;
    update();
  });
  els.insEnabled.addEventListener('change', function () {
    state.insurance.enabled = els.insEnabled.checked;
    update();
  });
  els.insRate.addEventListener('input', function () {
    const v = parseNum(els.insRate.value);
    const bad = v == null || Number.isNaN(v) || v < 0;
    els.insRate.classList.toggle('invalid', bad);
    if (!bad) { state.insurance.rate = v; update(); }
  });
  els.benchmark.addEventListener('input', function () {
    const v = parseNum(els.benchmark.value);
    const bad = Number.isNaN(v) || (v != null && v < 0);
    els.benchmark.classList.toggle('invalid', bad);
    if (!bad) { state.benchmark = v; update(); }
  });

  // ---------------------------------------------------------------------------
  // Блок 1. KPI-карточки
  // ---------------------------------------------------------------------------

  /** Направление «хорошо»: up — рост хорош, down — снижение хорошо, null — нейтрально. */
  const KPI_DEFS = [
    { key: 'revPerFot', label: 'Выручка на 1 ₽ ФОТ', kind: 'coef', better: 'up' },
    { key: 'profitPerFot', label: 'Прибыль на 1 ₽ ФОТ', kind: 'coef', better: 'up' },
    { key: 'fotShare', label: 'Доля ФОТ в выручке', kind: 'pct', better: 'down' },
  ];

  /** Причина, по которой показатель блока 1 не определён. */
  function reasonB1(key, row) {
    if (!row) return 'нет данных';
    const fot = row.fot;
    if (key === 'fotShare') {
      if (row.revenue == null) return 'не задана выручка';
      if (row.revenue === 0) return 'выручка равна 0 — доля не определена';
      return 'не задан ФОТ';
    }
    if (fot == null) return 'не задан ФОТ';
    if (fot === 0) return 'ФОТ равен 0 — деление на ноль';
    return key === 'revPerFot' ? 'не задана выручка' : 'не задана прибыль';
  }

  function deltaClass(d, better) {
    if (d === 0 || !better) return 'neutral';
    const up = d > 0;
    return (up === (better === 'up')) ? (up ? 'up-good' : 'down-good') : (up ? 'up-bad' : 'down-bad');
  }

  function renderKpis(analyzed) {
    const grid = document.getElementById('kpi-grid');
    const n = analyzed.length;
    const cur = analyzed[n - 1], prev = analyzed[n - 2];
    const curRow = state.rows[n - 1];
    document.getElementById('b1-caption').textContent = n
      ? 'Последний период: ' + (curRow.label || 'без названия') +
        (prev ? ' · изменение к периоду «' + (state.rows[n - 2].label || 'без названия') + '»' : '') +
        (state.insurance.enabled ? ' · ФОТ с учётом страховых взносов ' + nf1.format(state.insurance.rate) + ' %' : '')
      : 'Добавьте хотя бы один период.';
    grid.innerHTML = KPI_DEFS.map(function (d) {
      const v = cur ? cur[d.key] : null;
      const pv = prev ? prev[d.key] : null;
      let delta = '';
      if (v != null && pv != null) {
        const diff = v - pv;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        delta = '<div class="kpi-delta ' + deltaClass(diff, d.better) + '">' + arrow + ' ' + fmtDelta[d.kind](diff) +
          // Относительное изменение имеет смысл только от положительной базы.
          (d.kind !== 'pct' && pv > 0 ? ' (' + fmtSignedPct(diff / pv * 100) + ')' : '') +
          ' <span class="muted">к пред. периоду</span></div>';
      } else if (v != null) {
        delta = '<div class="kpi-delta muted">' + (prev ? 'за предыдущий период показатель не определён'
          : 'нет предыдущего периода для сравнения') + '</div>';
      }
      let bench = '';
      if (d.key === 'revPerFot' && state.benchmark != null && v != null) {
        const diffB = v - state.benchmark;
        bench = '<div class="kpi-delta ' + deltaClass(diffB, 'up') + '">' + fmtDelta.coef(diffB) +
          ' <span class="muted">к ориентиру ' + fmt.coef(state.benchmark) + '</span></div>';
      }
      return '<div class="kpi"><div class="kpi-label">' + d.label + ' ' + tipBtn(d.key) + '</div>' +
        '<div class="kpi-value">' + (v != null ? fmt[d.kind](v) : dash(reasonB1(d.key, curRow))) + '</div>' +
        delta + bench + '</div>';
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Блок 2. Таблица опережения и вывод
  // ---------------------------------------------------------------------------

  const STATUS_TEXT = { green: '🟢 Норма', yellow: '🟡 Внимание', red: '🔴 Риск' };
  function statusBadge(status) {
    return status ? '<span class="status status-' + status + '">' + STATUS_TEXT[status] + '</span>' : dash();
  }

  /** Причина, по которой индекс не определён. */
  function reasonB2(key, prevRow, curRow) {
    if (key === 'productivity' || key === 'avgWage') return 'не задана численность или ' + (key === 'productivity' ? 'выручка' : 'ФОТ');
    if (key === 'ipt') return prevRow && prevRow.revenue === 0 ? 'выручка пред. периода = 0' : 'нет производительности';
    if (key === 'izp') return prevRow && prevRow.fot === 0 ? 'ФОТ пред. периода = 0' : 'нет средней ЗП';
    if (curRow && curRow.fot === 0) return 'Iзп = 0';
    return 'нет индексов';
  }

  function cell(v, kind, reason) {
    return '<td class="r">' + (v != null ? fmt[kind](v) : dash(reason)) + '</td>';
  }

  function renderLeadTable(analyzed) {
    const body = document.getElementById('lead-body');
    if (analyzed.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="muted">Нет данных.</td></tr>';
      return;
    }
    body.innerHTML = analyzed.map(function (a, i) {
      const prevRow = state.rows[i - 1], curRow = state.rows[i];
      const first = i === 0;
      return '<tr><td>' + escapeHtml(a.label || '—') + '</td>' +
        cell(a.productivity, 'money', reasonB2('productivity')) +
        cell(a.avgWage, 'money', reasonB2('avgWage')) +
        (first
          ? '<td class="r" colspan="3"><span class="muted">базовый период</span></td><td></td>'
          : cell(a.ipt, 'coef', reasonB2('ipt', prevRow, curRow)) +
            cell(a.izp, 'coef', reasonB2('izp', prevRow, curRow)) +
            cell(a.lead, 'coef', reasonB2('lead', prevRow, curRow)) +
            '<td>' + statusBadge(a.status) + '</td>') +
        '</tr>';
    }).join('');
  }

  function renderSummary(analyzed) {
    const box = document.getElementById('lead-summary');
    if (analyzed.length < 2) {
      box.innerHTML = '<p>Для расчёта индексов нужно минимум два периода. Сценарий в блоке 3 строится и по одному периоду.</p>';
      return;
    }
    box.innerHTML = Calc.leadSummary(analyzed).map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('');
  }

  // ---------------------------------------------------------------------------
  // Графики (Chart.js)
  // ---------------------------------------------------------------------------

  let chartFot = null, chartLead = null;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function withAlpha(hex, a) {
    const n = parseInt(hex.replace('#', ''), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function baseOptions() {
    const text2 = cssVar('--text-2'), grid = cssVar('--grid');
    return {
      responsive: true,
      maintainAspectRatio: false,
      locale: 'ru-RU',
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: text2, boxWidth: 14, boxHeight: 2, usePointStyle: false } },
        tooltip: {},
      },
      scales: {
        x: { ticks: { color: text2 }, grid: { display: false }, border: { color: grid } },
      },
      _grid: grid,
      _text2: text2,
    };
  }

  /** Пунктир для отрезка, ведущего в сценарную точку. */
  function scenarioSegment(scnIdx) {
    return {
      borderDash: function (ctx) { return ctx.p1DataIndex === scnIdx ? [6, 4] : undefined; },
    };
  }
  function pointStyles(n, scnIdx, color, surface) {
    return {
      pointRadius: Array.from({ length: n }, function (_, i) { return i === scnIdx ? 6 : 3; }),
      pointHoverRadius: 7,
      pointStyle: Array.from({ length: n }, function (_, i) { return i === scnIdx ? 'rectRot' : 'circle'; }),
      pointBackgroundColor: Array.from({ length: n }, function (_, i) { return i === scnIdx ? surface : color; }),
      pointBorderColor: color,
      pointBorderWidth: 2,
    };
  }

  function buildFotChart(labels, series, scnIdx) {
    const c1 = cssVar('--series-1'), c2 = cssVar('--series-2'), c3 = cssVar('--series-3');
    const ref = cssVar('--ref-line'), surface = cssVar('--surface');
    const o = baseOptions();
    const n = labels.length;
    const datasets = [
      Object.assign({ label: 'Выручка на 1 ₽ ФОТ', data: series.revPerFot, borderColor: c1, yAxisID: 'y', borderWidth: 2,
        segment: scenarioSegment(scnIdx), _kind: 'coef' }, pointStyles(n, scnIdx, c1, surface)),
      Object.assign({ label: 'Прибыль на 1 ₽ ФОТ', data: series.profitPerFot, borderColor: c2, yAxisID: 'y', borderWidth: 2,
        segment: scenarioSegment(scnIdx), _kind: 'coef' }, pointStyles(n, scnIdx, c2, surface)),
      Object.assign({ label: 'Доля ФОТ в выручке, % (правая ось)', data: series.fotShare, borderColor: c3, yAxisID: 'y1', borderWidth: 2,
        segment: scenarioSegment(scnIdx), _kind: 'pct' }, pointStyles(n, scnIdx, c3, surface)),
    ];
    if (state.benchmark != null) {
      datasets.push({ label: 'Отраслевой ориентир', data: labels.map(function () { return state.benchmark; }),
        borderColor: ref, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, yAxisID: 'y', _kind: 'coef' });
    }
    o.scales.y = {
      position: 'left',
      title: { display: true, text: '₽ на 1 ₽ ФОТ', color: o._text2 },
      ticks: { color: o._text2, callback: function (v) { return nf2.format(v); } },
      grid: { color: o._grid }, border: { display: false },
    };
    o.scales.y1 = {
      position: 'right',
      title: { display: true, text: 'Доля ФОТ, %', color: o._text2 },
      ticks: { color: o._text2, callback: function (v) { return nf1.format(v) + ' %'; } },
      grid: { drawOnChartArea: false }, border: { display: false },
    };
    o.plugins.tooltip.callbacks = {
      label: function (ctx) {
        const v = ctx.parsed.y;
        if (v == null) return ctx.dataset.label + ': —';
        return ctx.dataset.label.replace(' (правая ось)', '') + ': ' + fmt[ctx.dataset._kind](v);
      },
    };
    if (chartFot) chartFot.destroy();
    chartFot = new Chart(document.getElementById('chart-fot'), { type: 'line', data: { labels: labels, datasets: datasets }, options: o });
  }

  function buildLeadChart(labels, series, scnIdx) {
    const c1 = cssVar('--series-1'), c2 = cssVar('--series-2'), c3 = cssVar('--series-3');
    const ref = cssVar('--ref-line'), surface = cssVar('--surface');
    const o = baseOptions();
    const n = labels.length;
    // Сценарные столбцы — полупрозрачные с контуром, чтобы отличались от факта.
    function barColors(c) {
      return {
        backgroundColor: labels.map(function (_, i) { return i === scnIdx ? withAlpha(c, 0.25) : c; }),
        borderColor: c,
        borderWidth: labels.map(function (_, i) { return i === scnIdx ? 2 : 0; }),
      };
    }
    const datasets = [
      Object.assign({ type: 'bar', label: 'Iпт — индекс производительности', data: series.ipt, base: 1, order: 2,
        borderRadius: 3, borderSkipped: false, maxBarThickness: 36 }, barColors(c1)),
      Object.assign({ type: 'bar', label: 'Iзп — индекс средней ЗП', data: series.izp, base: 1, order: 2,
        borderRadius: 3, borderSkipped: false, maxBarThickness: 36 }, barColors(c2)),
      Object.assign({ type: 'line', label: 'Коэффициент опережения', data: series.lead, borderColor: c3, borderWidth: 2,
        order: 1, segment: scenarioSegment(scnIdx) }, pointStyles(n, scnIdx, c3, surface)),
      { type: 'line', label: 'Уровень 1', data: labels.map(function () { return 1; }), borderColor: ref,
        borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, order: 0 },
    ];
    o.scales.y = {
      title: { display: true, text: 'Индекс (столбцы от уровня 1)', color: o._text2 },
      ticks: { color: o._text2, callback: function (v) { return nf2.format(v); } },
      grid: { color: o._grid }, border: { display: false }, grace: '10%',
      beginAtZero: false, // индексы колеблются около 1 — ноль на оси скрыл бы различия
    };
    o.plugins.tooltip.filter = function (item) { return item.dataset.label !== 'Уровень 1'; };
    o.plugins.tooltip.callbacks = {
      label: function (ctx) {
        const v = ctx.parsed.y;
        if (v == null) return ctx.dataset.label + ': —';
        const extra = ctx.dataset.type === 'bar' ? ' (' + fmtSignedPct((v - 1) * 100) + ')' : '';
        return ctx.dataset.label + ': ' + nf2.format(v) + extra;
      },
    };
    if (chartLead) chartLead.destroy();
    chartLead = new Chart(document.getElementById('chart-lead'), { type: 'bar', data: { labels: labels, datasets: datasets }, options: o });
  }

  function renderCharts(analyzed, scn) {
    if (typeof Chart === 'undefined') {
      document.querySelectorAll('.chart-box').forEach(function (b) {
        b.innerHTML = '<p class="muted">Не удалось загрузить библиотеку графиков (нет доступа к CDN). Таблицы и расчёты работают.</p>';
        b.style.height = 'auto';
      });
      return;
    }
    // Блок 1: все периоды + сценарий
    const rowsB1 = scn ? analyzed.concat([scn.analyzed]) : analyzed;
    const scnIdx1 = scn ? rowsB1.length - 1 : -1;
    buildFotChart(
      rowsB1.map(function (a, i) { return i === scnIdx1 ? 'Сценарий' : (a.label || '—'); }),
      {
        revPerFot: rowsB1.map(function (a) { return a.revPerFot; }),
        profitPerFot: rowsB1.map(function (a) { return a.profitPerFot; }),
        fotShare: rowsB1.map(function (a) { return a.fotShare; }),
      },
      scnIdx1
    );
    // Блок 2: периоды со второго + сценарий
    const rowsB2 = analyzed.slice(1).concat(scn ? [scn.analyzed] : []);
    const scnIdx2 = scn ? rowsB2.length - 1 : -1;
    buildLeadChart(
      rowsB2.map(function (a, i) { return i === scnIdx2 ? 'Сценарий' : (a.label || '—'); }),
      {
        ipt: rowsB2.map(function (a) { return a.ipt; }),
        izp: rowsB2.map(function (a) { return a.izp; }),
        lead: rowsB2.map(function (a) { return a.lead; }),
      },
      scnIdx2
    );
  }

  // ---------------------------------------------------------------------------
  // Блок 3. Сценарии
  // ---------------------------------------------------------------------------

  const sliders = {
    wage: document.getElementById('s-wage'),
    headcount: document.getElementById('s-headcount'),
    revenue: document.getElementById('s-revenue'),
  };
  const outputs = {
    wage: document.getElementById('o-wage'),
    headcount: document.getElementById('o-headcount'),
    revenue: document.getElementById('o-revenue'),
  };
  const marginInput = document.getElementById('s-margin');

  Object.keys(sliders).forEach(function (k) {
    sliders[k].addEventListener('input', function () {
      state.scenario[k] = Number(sliders[k].value);
      update();
    });
  });
  marginInput.addEventListener('input', function () {
    const v = parseNum(marginInput.value);
    const bad = v == null || Number.isNaN(v) || v < 0 || v > 100;
    marginInput.classList.toggle('invalid', bad);
    if (!bad) { state.scenario.margin = v; update(); }
  });
  document.getElementById('btn-scn-reset').addEventListener('click', function () {
    state.scenario = Object.assign({}, DEFAULT_SCENARIO, { margin: state.scenario.margin });
    syncScenarioControls();
    update();
  });

  function syncScenarioControls() {
    Object.keys(sliders).forEach(function (k) { sliders[k].value = state.scenario[k]; });
    marginInput.value = nfIn.format(state.scenario.margin);
    marginInput.classList.remove('invalid');
  }

  /** Строки сравнительной таблицы «Факт / Сценарий». */
  function compareDefs() {
    return [
      { key: 'revenue', label: 'Выручка', kind: 'money', better: 'up' },
      { key: 'profit', label: 'Прибыль', kind: 'money', better: 'up' },
      { key: 'fot', label: state.insurance.enabled ? 'ФОТ с взносами' : 'ФОТ', kind: 'money', better: null },
      { key: 'headcount', label: 'Численность, чел.', kind: 'people', better: null },
      { key: 'revPerFot', label: 'Выручка на 1 ₽ ФОТ', kind: 'coef', better: 'up', tip: 'revPerFot' },
      { key: 'profitPerFot', label: 'Прибыль на 1 ₽ ФОТ', kind: 'coef', better: 'up', tip: 'profitPerFot' },
      { key: 'fotShare', label: 'Доля ФОТ в выручке', kind: 'pct', better: 'down', tip: 'fotShare' },
      { key: 'productivity', label: 'Производительность, ₽/чел.', kind: 'money', better: 'up', tip: 'productivity' },
      { key: 'avgWage', label: 'Средняя ЗП, ₽', kind: 'money', better: null, tip: 'avgWage' },
      { key: 'ipt', label: 'Iпт', kind: 'coef', better: 'up', tip: 'ipt' },
      { key: 'izp', label: 'Iзп', kind: 'coef', better: null, tip: 'izp' },
      { key: 'lead', label: 'Коэффициент опережения', kind: 'coef', better: 'up', tip: 'lead' },
    ];
  }

  /** Считает сценарий от последнего периода. null — если последний период заполнен не полностью. */
  function computeScenario(analyzed) {
    const last = state.rows[state.rows.length - 1];
    if (!isComplete(last) || last.headcount <= 0) return null;
    const row = Calc.scenarioRow(last, state.scenario, state.insurance);
    const a = Calc.analyze([last, row], state.insurance)[1];
    return {
      row: row,
      analyzed: a,
      fact: Object.assign({}, analyzed[analyzed.length - 1], {
        revenue: last.revenue, profit: last.profit, headcount: last.headcount,
        fot: Calc.effectiveFot(last.fot, state.insurance),
      }),
      scen: Object.assign({}, a, {
        revenue: row.revenue, profit: row.profit, headcount: row.headcount,
        fot: Calc.effectiveFot(row.fot, state.insurance),
      }),
    };
  }

  function renderScenario(scn) {
    Object.keys(outputs).forEach(function (k) { outputs[k].textContent = fmtSignedPct(state.scenario[k]); });
    const last = state.rows[state.rows.length - 1];
    document.getElementById('b3-caption').textContent = last
      ? 'Прогноз на следующий ' + PERIOD_WORD[state.periodType] + ' от последнего фактического периода «' +
        (last.label || 'без названия') + '». Изменения задаются в процентах к нему.'
      : '';
    const statusEl = document.getElementById('scn-status');
    const hintEl = document.getElementById('scn-hint');
    const body = document.getElementById('compare-body');

    if (!scn) {
      statusEl.innerHTML = '';
      hintEl.innerHTML = '<p>Для сценария заполните все поля последнего периода (выручка, прибыль, ФОТ, численность &gt; 0).</p>';
      body.innerHTML = '';
      return;
    }

    const k = scn.analyzed.lead;
    statusEl.innerHTML = 'Коэффициент опережения в сценарии: <strong>' + (k != null ? fmt.coef(k) : '—') + '</strong> ' +
      statusBadge(Calc.leadStatus(k)) + ' ' + tipBtn('lead');

    // Допустимое повышение ЗП (аналитическое решение из calc.js)
    const s = state.scenario;
    const maxW = Calc.maxWageGrowth(s.revenue, s.headcount);
    let html = '<p><strong>Допустимое повышение средней ЗП</strong> ' + tipBtn('maxWage') + '<br>';
    if (maxW >= 0) {
      html += 'При росте выручки ' + fmtSignedPct(s.revenue) + ' и изменении численности ' + fmtSignedPct(s.headcount) +
        ' средняя ЗП может вырасти не более чем на <strong>' + fmtSignedPct(maxW) + '</strong>, чтобы коэффициент опережения остался ≥ 1.';
    } else {
      html += 'При выбранных параметрах производительность снижается (' + fmtSignedPct(maxW) + '). ' +
        'Чтобы коэффициент опережения остался ≥ 1, средняя ЗП должна снизиться не менее чем на <strong>' +
        nf1.format(Math.abs(maxW)) + NBSP + '%</strong>.';
    }
    html += '</p><p>';
    const excess = s.wage - maxW;
    if (excess <= 1e-9) {
      html += '<span class="up-good">Выбранный рост ЗП (' + fmtSignedPct(s.wage) + ') укладывается в допустимый.</span>';
    } else {
      html += '<span class="up-bad">Выбранный рост ЗП (' + fmtSignedPct(s.wage) + ') превышает допустимый на ' +
        nf1.format(excess) + NBSP + 'п.п.</span>';
    }
    const target = Math.max(-20, Math.min(50, Math.floor(maxW * 10) / 10));
    if (Math.abs(target - s.wage) > 0.05) {
      html += ' <button type="button" class="btn-link" id="btn-apply-max">Установить ' + fmtSignedPct(target) + '</button>';
      if (target !== Math.floor(maxW * 10) / 10) html += ' <span class="muted">(ограничено диапазоном слайдера)</span>';
    }
    html += '</p>';
    hintEl.innerHTML = html;
    const applyBtn = document.getElementById('btn-apply-max');
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        state.scenario.wage = target;
        sliders.wage.value = target;
        update();
      });
    }

    body.innerHTML = compareDefs().map(function (d) {
      const f = scn.fact[d.key], sc = scn.scen[d.key];
      let diff = dash();
      if (f != null && sc != null) {
        const dv = sc - f;
        const rel = d.kind === 'money' && f > 0 ? ' (' + fmtSignedPct(dv / f * 100) + ')' : '';
        // Разница меньше точности отображения считается нулевой (нейтральный цвет).
        const eps = d.kind === 'coef' ? 0.005 : d.kind === 'pct' ? 0.05 : 0.5;
        diff = '<span class="' + deltaClass(Math.abs(dv) < eps ? 0 : dv, d.better) + '">' + fmtDelta[d.kind](dv) + rel + '</span>';
      }
      const factCell = f != null ? fmt[d.kind](f) : dash(d.key === 'ipt' || d.key === 'izp' || d.key === 'lead'
        ? (state.rows.length < 2 ? 'нужен пред. период' : 'не определён, см. блок 2') : 'не определён');
      return '<tr><td>' + d.label + (d.tip ? ' ' + tipBtn(d.tip) : '') + '</td>' +
        '<td class="r">' + factCell + '</td>' +
        '<td class="r">' + (sc != null ? fmt[d.kind](sc) : dash()) + '</td>' +
        '<td class="r">' + diff + '</td></tr>';
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Общий цикл обновления
  // ---------------------------------------------------------------------------

  function update() {
    const analyzed = Calc.analyze(state.rows, state.insurance);
    const scn = state.rows.length ? computeScenario(analyzed) : null;
    renderKpis(analyzed);
    renderLeadTable(analyzed);
    renderSummary(analyzed);
    renderScenario(scn);
    renderCharts(analyzed, scn);
    saveState();
  }

  function initControls() {
    els.periodType.value = state.periodType;
    els.insEnabled.checked = state.insurance.enabled;
    els.insRate.value = nfIn.format(state.insurance.rate);
    els.insRate.classList.remove('invalid');
    els.benchmark.value = state.benchmark != null ? nfIn.format(state.benchmark) : '';
    els.benchmark.classList.remove('invalid');
    els.exampleNote.hidden = !state.isExample;
    syncScenarioControls();
    renderInputTable();
    refreshErrorText();
    update();
  }

  // Перерисовка графиков при смене системной темы (цвета берутся из CSS-переменных).
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
  } catch (e) { /* старые браузеры */ }

  initControls();

  // Для проверки в консоли: window.App.state, window.Calc.analyze(App.state.rows, App.state.insurance)
  window.App = { get state() { return state; } };
})();
