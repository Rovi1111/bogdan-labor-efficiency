/**
 * app.js — интерфейс: три ползунка, три показателя и один график.
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
  /** Число со знаком «−» (типографский минус) для отрицательных значений. */
  function num(v, nf) { return (v < 0 ? MINUS : '') + nf.format(Math.abs(v)); }
  const fmt = {
    mln: function (v) { return num(v, nf1) + NBSP + 'млн' + NBSP + '₽'; },
    coef: function (v) { return v == null ? '—' : num(v, nf2); },
    pct: function (v) { return v == null ? '—' : num(v, nf1) + NBSP + '%'; },
  };

  // --- Цвета графика берутся из CSS-переменных (светлая/тёмная тема) ---
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  let chart = null;
  let chartFailed = typeof Chart === 'undefined';
  if (chartFailed) {
    $('chart-fot').parentNode.innerHTML =
      '<p class="muted">Не удалось загрузить библиотеку графиков. Показатели выше считаются и без неё.</p>';
  }

  /** Показатель и подпись под ним: формула или причина, по которой значение не определено. */
  function setKpi(id, text, note) {
    $('k-' + id).textContent = text;
    $('n-' + id).textContent = note;
  }

  function update() {
    const revenue = Number($('f-revenue').value);
    const fot = Number($('f-fot').value);
    const profit = Number($('f-profit').value);
    $('o-revenue').textContent = fmt.mln(revenue);
    $('o-fot').textContent = fmt.mln(fot);
    $('o-profit').textContent = fmt.mln(profit);

    const r = Calc.fotReturn(revenue, fot, profit);
    setKpi('rev', fmt.coef(r.revPerFot), r.revPerFot == null ? 'ФОТ равен 0 — не определено' : 'Выручка / ФОТ');
    setKpi('profit', fmt.coef(r.profitPerFot), r.profitPerFot == null ? 'ФОТ равен 0 — не определено' : 'Прибыль / ФОТ');
    setKpi('share', fmt.pct(r.fotShare), r.fotShare == null ? 'Выручка равна 0 — не определено' : 'ФОТ / Выручка × 100 %');

    // Проверка согласованности: прибыль не может превышать выручку за вычетом ФОТ.
    const other = Calc.otherCosts(revenue, fot, profit);
    const warn = $('warning');
    warn.hidden = other >= 0;
    warn.textContent = other < 0
      ? 'Прибыль больше, чем выручка минус ФОТ (на ' + fmt.mln(-other) + '). Проверьте значения.'
      : '';

    if (!chartFailed) drawChart(revenue, fot, profit, r);
  }

  function drawChart(revenue, fot, profit, r) {
    // Кривые: ФОТ от половины до полутора текущих значений (не меньше 0,1 млн, чтобы не делить на 0).
    const lo = Math.max(0.1, fot * 0.5), hi = Math.max(1, fot * 1.5);
    const revCurve = [], profitCurve = [];
    for (let i = 0; i <= 60; i++) {
      const x = lo + (hi - lo) * i / 60;
      revCurve.push({ x: x, y: revenue / x });
      profitCurve.push({ x: x, y: Calc.profitAtFot(profit, fot, x) / x });
    }

    const c = {
      s1: cssVar('--series-1'), s2: cssVar('--series-2'), ref: cssVar('--ref-line'),
      grid: cssVar('--grid'), text: cssVar('--text-2'), surface: cssVar('--surface'),
    };
    function curve(label, data, color, extra) {
      return Object.assign({ type: 'line', label: label, data: data, borderColor: color, backgroundColor: color,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 }, extra || {});
    }
    function marker(label, point, color) {
      return { type: 'scatter', label: label, data: point ? [point] : [], pointStyle: 'rectRot', pointRadius: 8,
        pointHoverRadius: 9, borderColor: color, backgroundColor: c.surface, borderWidth: 2.5 };
    }

    const config = {
      data: { datasets: [
        curve('Выручка на 1 ₽ ФОТ', revCurve, c.s1),
        curve('Прибыль на 1 ₽ ФОТ', profitCurve, c.s2),
        curve('Ноль', [{ x: lo, y: 0 }, { x: hi, y: 0 }], c.ref, { borderWidth: 1, borderDash: [4, 4], pointHoverRadius: 0 }),
        marker('Сейчас: выручка на 1 ₽ ФОТ', r.revPerFot == null ? null : { x: fot, y: r.revPerFot }, c.s1),
        marker('Сейчас: прибыль на 1 ₽ ФОТ', r.profitPerFot == null ? null : { x: fot, y: r.profitPerFot }, c.s2),
      ] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        locale: 'ru-RU',
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          // В легенде — только две кривые; маркеры и нулевая линия поясняются подписью над графиком.
          legend: { position: 'bottom', labels: { color: c.text, boxWidth: 14, boxHeight: 2,
            filter: function (item) { return item.datasetIndex < 2; } } },
          tooltip: {
            filter: function (item) { return item.datasetIndex !== 2; },
            callbacks: {
              title: function (items) { return 'ФОТ ' + fmt.mln(items[0].parsed.x); },
              label: function (ctx) { return ctx.dataset.label + ': ' + fmt.coef(ctx.parsed.y); },
            },
          },
        },
        scales: {
          x: { type: 'linear', min: lo, max: hi,
            title: { display: true, text: 'ФОТ, млн ₽', color: c.text },
            ticks: { color: c.text, maxTicksLimit: 7, callback: function (v) { return num(v, nf1); } },
            grid: { display: false }, border: { color: c.grid } },
          y: { title: { display: true, text: '₽ на 1 ₽ ФОТ', color: c.text },
            ticks: { color: c.text, callback: function (v) { return num(v, nf2); } },
            grid: { color: c.grid }, border: { display: false } },
        },
      },
    };

    if (chart) chart.destroy();
    chart = new Chart($('chart-fot'), config);
  }

  ['f-revenue', 'f-fot', 'f-profit'].forEach(function (id) { $(id).addEventListener('input', update); });
  // Перерисовка при смене системной темы: цвета графика берутся из CSS.
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
  } catch (e) { /* старые браузеры */ }

  update();
})();
