/**
 * calc.js — расчётное ядро. Только чистые функции, без обращений к DOM.
 * Там, где показатель не определён (деление на ноль), функции возвращают null —
 * интерфейс показывает такие значения как «—».
 */
(function (root) {
  'use strict';

  /** Безопасное деление: null, если знаменатель 0 или результат не конечен. */
  function safeDiv(a, b) {
    if (b === 0) return null;
    const r = a / b;
    return Number.isFinite(r) ? r : null;
  }

  /**
   * Отдача ФОТ.
   * Выручка на 1 ₽ ФОТ = В / ФОТ; Прибыль на 1 ₽ ФОТ = П / ФОТ; Доля ФОТ = ФОТ / В × 100 %.
   */
  function fotReturn(revenue, fot, profit) {
    return {
      revPerFot: safeDiv(revenue, fot),
      profitPerFot: safeDiv(profit, fot),
      fotShare: revenue > 0 ? fot / revenue * 100 : null,
    };
  }

  /**
   * Прибыль при другом размере ФОТ, если выручка и прочие расходы не меняются:
   * каждый дополнительный рубль ФОТ уменьшает прибыль на рубль.
   */
  function profitAtFot(profit, fot, newFot) {
    return profit - (newFot - fot);
  }

  /**
   * Опережение производительности над зарплатой (все входы — в процентах).
   * Iпт = (1 + рост выручки) / (1 + изменение численности)
   * Iзп = 1 + рост средней ЗП
   * К   = Iпт / Iзп
   */
  function leadIndices(revenuePct, headcountPct, wagePct) {
    const ipt = safeDiv(1 + revenuePct / 100, 1 + headcountPct / 100);
    const izp = 1 + wagePct / 100;
    return { ipt: ipt, izp: izp, lead: ipt == null ? null : safeDiv(ipt, izp) };
  }

  /** Светофор: 'green' (К > 1), 'yellow' (0,95–1), 'red' (< 0,95). */
  function leadStatus(lead) {
    if (lead == null) return null;
    if (lead > 1) return 'green';
    if (lead >= 0.95) return 'yellow';
    return 'red';
  }

  /** Максимальный рост средней ЗП (в %), при котором К ≥ 1: (1 + ΔВ) / (1 + ΔЧ) − 1. */
  function maxWageGrowth(revenuePct, headcountPct) {
    const ipt = safeDiv(1 + revenuePct / 100, 1 + headcountPct / 100);
    return ipt == null ? null : (ipt - 1) * 100;
  }

  const Calc = {
    safeDiv: safeDiv,
    fotReturn: fotReturn,
    profitAtFot: profitAtFot,
    leadIndices: leadIndices,
    leadStatus: leadStatus,
    maxWageGrowth: maxWageGrowth,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== 'undefined' ? window : this);
