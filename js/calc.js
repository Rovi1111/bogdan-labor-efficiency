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
   * Прочие расходы (всё, кроме ФОТ) = Выручка − ФОТ − Прибыль.
   * Отрицательное значение означает, что введённые числа не согласуются друг с другом.
   */
  function otherCosts(revenue, fot, profit) {
    return revenue - fot - profit;
  }

  const Calc = {
    safeDiv: safeDiv,
    fotReturn: fotReturn,
    profitAtFot: profitAtFot,
    otherCosts: otherCosts,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== 'undefined' ? window : this);
