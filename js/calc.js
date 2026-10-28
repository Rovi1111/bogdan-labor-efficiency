/**
 * calc.js — расчётное ядро.
 *
 * Только чистые функции: никаких обращений к DOM, localStorage или Chart.js.
 * Все функции возвращают null там, где показатель не определён
 * (деление на ноль, отсутствие предыдущего периода и т. п.) —
 * интерфейс показывает такие значения как «—».
 *
 * Модуль доступен как глобальный объект window.Calc (и через module.exports,
 * если файл подключён в Node для проверки).
 */
(function (root) {
  'use strict';

  /** Пороги светофора для коэффициента опережения. */
  const THRESHOLDS = { green: 1, yellow: 0.95 };

  /** Безопасное деление: null, если знаменатель 0 или результат не конечен. */
  function safeDiv(a, b) {
    if (a == null || b == null || b === 0) return null;
    const r = a / b;
    return Number.isFinite(r) ? r : null;
  }

  /**
   * ФОТ, используемый в расчётах: с учётом страховых взносов или без.
   * @param {number} fot — ФОТ из таблицы, ₽
   * @param {{enabled: boolean, rate: number}} insurance — rate в процентах
   */
  function effectiveFot(fot, insurance) {
    if (fot == null) return null;
    if (!insurance || !insurance.enabled) return fot;
    return fot * (1 + (Number(insurance.rate) || 0) / 100);
  }

  /**
   * Блок 1. Отдача ФОТ за один период.
   * @returns {{fot, revPerFot, profitPerFot, fotShare}} fotShare — в процентах
   */
  function fotReturn(row, insurance) {
    const fot = effectiveFot(row.fot, insurance);
    return {
      fot: fot,
      revPerFot: safeDiv(row.revenue, fot),
      profitPerFot: safeDiv(row.profit, fot),
      fotShare: row.revenue > 0 ? safeDiv(fot, row.revenue) * 100 : null,
    };
  }

  /**
   * Производительность труда и средняя зарплата за период.
   * @returns {{productivity, avgWage}} — ₽ на 1 человека за период
   */
  function laborMetrics(row, insurance) {
    const fot = effectiveFot(row.fot, insurance);
    return {
      productivity: safeDiv(row.revenue, row.headcount),
      avgWage: safeDiv(fot, row.headcount),
    };
  }

  /**
   * Блок 2. Индексы и коэффициент опережения между двумя периодами.
   * Iпт = Произв.тек / Произв.пред; Iзп = СрЗП.тек / СрЗП.пред; К = Iпт / Iзп.
   */
  function leadIndices(prevRow, curRow, insurance) {
    const p = laborMetrics(prevRow, insurance);
    const c = laborMetrics(curRow, insurance);
    const ipt = safeDiv(c.productivity, p.productivity);
    const izp = safeDiv(c.avgWage, p.avgWage);
    return { ipt: ipt, izp: izp, lead: safeDiv(ipt, izp) };
  }

  /** Статус светофора: 'green' (> 1), 'yellow' (0,95–1), 'red' (< 0,95), null. */
  function leadStatus(lead) {
    if (lead == null) return null;
    if (lead > THRESHOLDS.green) return 'green';
    if (lead >= THRESHOLDS.yellow) return 'yellow';
    return 'red';
  }

  /**
   * Полный разбор ряда периодов.
   * @param {Array<{label, revenue, profit, fot, headcount}>} rows
   * @param {{enabled, rate}} insurance
   * @returns {Array} — для каждого периода все показатели блоков 1 и 2
   */
  function analyze(rows, insurance) {
    return rows.map(function (row, i) {
      const base = Object.assign(
        { label: row.label },
        fotReturn(row, insurance),
        laborMetrics(row, insurance)
      );
      const idx = i > 0
        ? leadIndices(rows[i - 1], row, insurance)
        : { ipt: null, izp: null, lead: null };
      return Object.assign(base, idx, { status: leadStatus(idx.lead) });
    });
  }

  /**
   * Блок 3. Прогнозный период от последнего фактического.
   * Все проценты — в процентах (10 означает +10 %).
   *
   * Численность' = Ч × (1 + dH);  СрЗП' = СрЗП × (1 + dW);  ФОТ' = СрЗП' × Ч'
   * Выручка' = В × (1 + dR)
   * Прибыль' = П + (В' − В) × маржинальность − (ФОТ'эфф − ФОТэфф)
   *
   * Возвращает строку в том же формате, что и строки таблицы (ФОТ — без взносов),
   * чтобы к ней применялись те же функции, что и к факту.
   */
  function scenarioRow(last, params, insurance) {
    const dW = (Number(params.wage) || 0) / 100;
    const dH = (Number(params.headcount) || 0) / 100;
    const dR = (Number(params.revenue) || 0) / 100;
    const margin = (Number(params.margin) || 0) / 100;

    const headcount = last.headcount * (1 + dH);
    const fot = last.fot * (1 + dW) * (1 + dH); // СрЗП' × Ч' в «сырых» рублях
    const revenue = last.revenue * (1 + dR);
    const dFotEff = effectiveFot(fot, insurance) - effectiveFot(last.fot, insurance);
    const profit = last.profit + (revenue - last.revenue) * margin - dFotEff;

    return { label: 'Сценарий', revenue: revenue, profit: profit, fot: fot, headcount: headcount };
  }

  /**
   * Допустимое повышение средней ЗП (в %), при котором К ≥ 1.
   *
   * Iпт = (1 + dR) / (1 + dH), Iзп = 1 + dW  ⇒  К ≥ 1  ⇔  dW ≤ (1 + dR) / (1 + dH) − 1.
   * Ставка страховых взносов на ответ не влияет — она сокращается в индексе ЗП.
   */
  function maxWageGrowth(revenuePct, headcountPct) {
    const r = safeDiv(1 + revenuePct / 100, 1 + headcountPct / 100);
    return r == null ? null : (r - 1) * 100;
  }

  /**
   * Автоматический текстовый вывод по блоку 2.
   * @param {Array} analyzed — результат analyze()
   * @returns {string[]} — абзацы вывода
   */
  function leadSummary(analyzed) {
    const valid = analyzed.filter(function (a) { return a.lead != null; });
    if (valid.length === 0) {
      return ['Для сравнения нужно минимум два периода с ненулевой численностью, выручкой и ФОТ.'];
    }
    const faster = valid.filter(function (a) { return a.lead > 1; }).length;
    const out = [
      'В ' + faster + ' из ' + valid.length + ' ' + plural(valid.length, 'периода', 'периодов', 'периодов') +
      ' производительность росла быстрее зарплаты.',
    ];
    const last = analyzed[analyzed.length - 1];
    if (last.lead == null) {
      out.push('Для последнего периода коэффициент опережения не определён.');
    } else if (last.lead >= 1) {
      out.push('В последнем периоде рост производительности опередил рост ЗП на ' +
        fmtPct((last.lead - 1) * 100) + '.');
    } else {
      // «Опередил на X %»: во сколько раз индекс ЗП больше индекса производительности.
      out.push('В последнем периоде рост ЗП опередил рост производительности на ' +
        fmtPct((1 / last.lead - 1) * 100) + '.');
    }
    return out;
  }

  // --- вспомогательные (используются и интерфейсом) ---

  /** Русское склонение по числу: plural(5, 'период', 'периода', 'периодов'). */
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function fmtPct(v, digits) {
    const d = digits == null ? 1 : digits;
    return v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
  }

  const Calc = {
    THRESHOLDS: THRESHOLDS,
    safeDiv: safeDiv,
    effectiveFot: effectiveFot,
    fotReturn: fotReturn,
    laborMetrics: laborMetrics,
    leadIndices: leadIndices,
    leadStatus: leadStatus,
    analyze: analyze,
    scenarioRow: scenarioRow,
    maxWageGrowth: maxWageGrowth,
    leadSummary: leadSummary,
    plural: plural,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== 'undefined' ? window : this);
