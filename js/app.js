/**
 * app.js — интерфейс: переключение вкладок, ползунки и по одному графику на вкладку.
 * Все вычисления — в calc.js (window.Calc).
 */
(function () {
  'use strict';

  const Calc = window.Calc;
  const $ = function (id) { return document.getElementById(id); };

  // --- Форматирование в русской локали ---
  const nf1 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const NBSP = ' ', MINUS = '−';
  function signed(v, nf) { return (v > 0 ? '+' : v < 0 ? MINUS : '') + nf.format(Math.abs(v)); }
  function unsigned(v, nf) { return (v < 0 ? MINUS : '') + nf.format(Math.abs(v)); }
  const fmt = {
    mln: function (v) { return unsigned(v, nf1) + NBSP + 'млн' + NBSP + '₽'; },
    coef: function (v) { return v == null ? '—' : unsigned(v, nf2); },
    pct: function (v) { return v == null ? '—' : unsigned(v, nf1) + NBSP + '%'; },
    growth: function (v) { return signed(v, nf1) + NBSP + '%'; },
  };

  // --- Цвета графиков берутся из CSS-переменных (светлая/тёмная тема) ---
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function colors() {
    return {
      s1: cssVar('--series-1'), s2: cssVar('--series-2'), ref: cssVar('--ref-line'),
      grid: cssVar('--grid'), text: cssVar('--text-2'), surface: cssVar('--surface'),
      bad: cssVar('--bad'), warn: cssVar('--warn'),
    };
  }

  /** Общие настройки графика с числовой осью X. */
  function baseOptions(c, xTitle, yTitle, xTick, yTick) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      locale: 'ru-RU',
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: c.text, boxWidth: 14, boxHeight: 2 } },
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: xTitle, color: c.text },
          ticks: { color: c.text, callback: xTick }, grid: { display: false }, border: { color: c.grid } },
        y: { title: { display: true, text: yTitle, color: c.text },
          ticks: { color: c.text, callback: yTick }, grid: { color: c.grid }, border: { display: false } },
      },
    };
  }

  /** Линия-кривая без точек. */
  function curve(label, data, color, extra) {
    return Object.assign({ type: 'line', label: label, data: data, borderColor: color, backgroundColor: color,
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 }, extra || {});
  }
  /** Маркер текущего значения (ромб). */
  function marker(label, point, color, surface) {
    return { type: 'scatter', label: label, data: point ? [point] : [], pointStyle: 'rectRot', pointRadius: 8,
      pointHoverRadius: 9, borderColor: color, backgroundColor: surface, borderWidth: 2.5 };
  }

  const charts = {};
  function draw(id, config) {
    if (typeof Chart === 'undefined') {
      $(id).parentNode.innerHTML = '<p class="muted">Не удалось загрузить библиотеку графиков. Показатели выше считаются и без неё.</p>';
      return;
    }
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
  }

  // ===========================================================================
  // Вкладка 1. Отдача ФОТ
  // ===========================================================================

  function updateFot() {
    const revenue = Number($('f-revenue').value);
    const fot = Number($('f-fot').value);
    const profit = Number($('f-profit').value);
    $('o-revenue').textContent = fmt.mln(revenue);
    $('o-fot').textContent = fmt.mln(fot);
    $('o-profit').textContent = fmt.mln(profit);

    const r = Calc.fotReturn(revenue, fot, profit);
    $('k-rev').textContent = fmt.coef(r.revPerFot);
    $('k-profit').textContent = fmt.coef(r.profitPerFot);
    $('k-share').textContent = fmt.pct(r.fotShare);
    $('k-rev').title = r.revPerFot == null ? 'ФОТ равен 0 — показатель не определён' : '';
    $('k-profit').title = r.profitPerFot == null ? 'ФОТ равен 0 — показатель не определён' : '';
    $('k-share').title = r.fotShare == null ? 'Выручка равна 0 — доля не определена' : '';

    // Кривые: ФОТ от половины до полутора текущих значений.
    const lo = Math.max(0.1, fot * 0.5), hi = Math.max(1, fot * 1.5);
    const revCurve = [], profitCurve = [];
    for (let i = 0; i <= 60; i++) {
      const x = lo + (hi - lo) * i / 60;
      revCurve.push({ x: x, y: revenue / x });
      profitCurve.push({ x: x, y: Calc.profitAtFot(profit, fot, x) / x });
    }
    const c = colors();
    const opt = baseOptions(c, 'ФОТ, млн ₽', '₽ на 1 ₽ ФОТ',
      function (v) { return nf1.format(v); }, function (v) { return nf2.format(v); });
    opt.plugins.tooltip = { callbacks: {
      title: function (items) { return 'ФОТ ' + fmt.mln(items[0].parsed.x); },
      label: function (ctx) { return ctx.dataset.label + ': ' + fmt.coef(ctx.parsed.y); },
    } };
    // В легенде — только две кривые; маркеры и нулевая линия поясняются подписью над графиком.
    opt.plugins.legend.labels.filter = function (item) { return item.datasetIndex < 2; };
    draw('chart-fot', {
      data: { datasets: [
        curve('Выручка на 1 ₽ ФОТ', revCurve, c.s1),
        curve('Прибыль на 1 ₽ ФОТ', profitCurve, c.s2),
        curve('Ноль', [{ x: lo, y: 0 }, { x: hi, y: 0 }], c.ref, { borderWidth: 1, borderDash: [4, 4], pointHoverRadius: 0 }),
        marker('Текущая выручка на 1 ₽ ФОТ', r.revPerFot == null ? null : { x: fot, y: r.revPerFot }, c.s1, c.surface),
        marker('Текущая прибыль на 1 ₽ ФОТ', r.profitPerFot == null ? null : { x: fot, y: r.profitPerFot }, c.s2, c.surface),
      ] },
      options: opt,
    });
  }

  // ===========================================================================
  // Вкладка 2. Опережение производительности над зарплатой
  // ===========================================================================

  const STATUS_TEXT = { green: '🟢 Норма', yellow: '🟡 Внимание', red: '🔴 Риск' };

  function updateLead() {
    const rev = Number($('l-revenue').value);
    const hc = Number($('l-headcount').value);
    const wage = Number($('l-wage').value);
    $('o-l-revenue').textContent = fmt.growth(rev);
    $('o-l-headcount').textContent = fmt.growth(hc);
    $('o-l-wage').textContent = fmt.growth(wage);

    const k = Calc.leadIndices(rev, hc, wage);
    const status = Calc.leadStatus(k.lead);
    $('k-lead').textContent = fmt.coef(k.lead);
    $('k-status').innerHTML = status ? '<span class="status status-' + status + '">' + STATUS_TEXT[status] + '</span>' : '';
    $('k-ipt').textContent = fmt.coef(k.ipt);
    $('k-izp').textContent = fmt.coef(k.izp);

    const maxW = Calc.maxWageGrowth(rev, hc);
    $('k-max').textContent = maxW == null ? '—' : 'до ' + fmt.growth(maxW);
    $('k-max-note').textContent = maxW == null ? ''
      : wage <= maxW + 1e-9
        ? 'Выбранный рост ' + fmt.growth(wage) + ' укладывается в допустимый.'
        : 'Выбранный рост ' + fmt.growth(wage) + ' выше допустимого на ' + nf1.format(wage - maxW) + NBSP + 'п.п.';

    // Кривая К(рост ЗП) по всему диапазону ползунка.
    const pts = [];
    for (let w = -20; w <= 50; w += 1) pts.push({ x: w, y: Calc.leadIndices(rev, hc, w).lead });
    const c = colors();
    const opt = baseOptions(c, 'Рост средней зарплаты, %', 'Коэффициент опережения',
      function (v) { return signed(v, new Intl.NumberFormat('ru-RU')); }, function (v) { return nf2.format(v); });
    opt.scales.x.min = -20;
    opt.scales.x.max = 50;
    opt.scales.x.ticks.stepSize = 10;
    opt.plugins.tooltip = { callbacks: {
      title: function (items) { return 'Рост ЗП ' + fmt.growth(items[0].parsed.x); },
      label: function (ctx) { return ctx.dataset.label + ': ' + fmt.coef(ctx.parsed.y); },
    } };
    draw('chart-lead', {
      data: { datasets: [
        curve('Коэффициент опережения', pts, c.s1),
        curve('Порог 1', [{ x: -20, y: 1 }, { x: 50, y: 1 }], c.ref, { borderWidth: 1.5, borderDash: [5, 4], pointHoverRadius: 0 }),
        curve('Порог 0,95', [{ x: -20, y: 0.95 }, { x: 50, y: 0.95 }], c.bad, { borderWidth: 1, borderDash: [2, 3], pointHoverRadius: 0 }),
        marker('Выбранный рост ЗП', k.lead == null ? null : { x: wage, y: k.lead }, c.s1, c.surface),
      ] },
      options: opt,
    });
  }

  // ===========================================================================
  // Переключение вкладок (через #fot / #lead, чтобы на вкладку можно было дать ссылку)
  // ===========================================================================

  function showPage() {
    const page = location.hash === '#lead' ? 'lead' : 'fot';
    ['fot', 'lead'].forEach(function (p) {
      $('page-' + p).hidden = p !== page;
      $('tab-' + p).setAttribute('aria-selected', String(p === page));
    });
    // Chart.js не умеет считать размер скрытого холста — рисуем после показа.
    if (page === 'fot') updateFot(); else updateLead();
  }

  ['f-revenue', 'f-fot', 'f-profit'].forEach(function (id) { $(id).addEventListener('input', updateFot); });
  ['l-revenue', 'l-headcount', 'l-wage'].forEach(function (id) { $(id).addEventListener('input', updateLead); });
  window.addEventListener('hashchange', showPage);
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', showPage);
  } catch (e) { /* старые браузеры */ }

  showPage();
})();
