/* 진단 엔진: 규칙 기반(rules.json). 같은 입력이면 항상 같은 결과를 낸다.
   브라우저와 node 테스트에서 함께 쓰도록 UMD 형태로 작성. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // 합계가 정확히 100이 되도록 반올림(최대잔여법)
  function normalize(w, ids) {
    var sum = ids.reduce(function (s, k) { return s + w[k]; }, 0);
    var raw = ids.map(function (k) { return { k: k, v: (w[k] / sum) * 100 }; });
    raw.forEach(function (r) { r.f = Math.floor(r.v); r.r = r.v - r.f; });
    var left = 100 - raw.reduce(function (s, r) { return s + r.f; }, 0);
    raw.slice().sort(function (a, b) { return b.r - a.r || (a.k < b.k ? -1 : 1); })
      .slice(0, left).forEach(function (r) { r.f += 1; });
    var out = {};
    raw.forEach(function (r) { out[r.k] = r.f; });
    return out;
  }

  function bandFor(score, bands) {
    for (var i = 0; i < bands.length; i++) if (score <= bands[i].max) return bands[i];
    return bands[bands.length - 1];
  }

  function diagnose(answers, rules) {
    var reasons = [];
    var R = rules.risk;
    var ids = rules.groups.map(function (g) { return g.id; });

    var score = R.loss[answers.loss] + R.horizon[answers.horizon] + R.purpose[answers.purpose];
    if (answers.liquidity === "high") score += R.liquidityHigh;
    score = clamp(score, 0, 100);
    var band = bandFor(score, R.bands);

    reasons.push("감내 손실 '" + lossText(answers.loss) + "', 투자 기간, 목적을 합산해 위험 점수 " + score + "점(" + band.name + ")으로 계산했습니다.");

    var w = {};
    ids.forEach(function (k) { w[k] = rules.baseWeights[band.id][k]; });

    var C = rules.constraints;
    if (answers.horizon === "m6" && w.market > C.shortHorizonMarketCap) {
      var moved = w.market - C.shortHorizonMarketCap;
      w.market = C.shortHorizonMarketCap; w.liquid += moved;
      reasons.push("투자 기간이 6개월 이내라 시장연계형을 " + C.shortHorizonMarketCap + "% 이하로 제한하고 유동·안정형을 늘렸습니다.");
    }
    if (answers.liquidity === "high" && w.liquid < C.highLiquidityLiquidFloor) {
      var need = C.highLiquidityLiquidFloor - w.liquid;
      var fromMarket = Math.min(need, w.market);
      w.market -= fromMarket; need -= fromMarket;
      w.income -= Math.min(need, w.income);
      w.liquid = C.highLiquidityLiquidFloor;
      reasons.push("중도 현금 필요 가능성이 높아 유동·안정형을 최소 " + C.highLiquidityLiquidFloor + "%로 맞췄습니다.");
    }

    var weights = normalize(w, ids);
    var fit = {};
    ids.forEach(function (k) {
      fit[k] = weights[k] >= rules.fit.high ? "상" : weights[k] >= rules.fit.mid ? "중" : "하";
    });

    var tax = taxPriority(answers);
    if (tax.reason) reasons.push(tax.reason);

    return { score: score, band: band, weights: weights, fit: fit, tax: tax, reasons: reasons,
             fx: answers.fx === "yes" };
  }

  function taxPriority(a) {
    var base = a.purpose === "tax" || a.purpose === "retire" ? 2 : (a.horizon === "y3" || a.horizon === "y5" ? 1 : 0);
    if (a.taxroom === "no") base = Math.max(0, base - 2);
    if (a.horizon === "m6" || a.horizon === "y1") base = Math.min(base, 0);
    var level = base >= 2 ? "상" : base === 1 ? "중" : "하";
    var reason;
    if (a.horizon === "m6" || a.horizon === "y1") reason = "투자 기간이 짧아 의무 가입·수령 기간이 있는 절세계좌(ISA, 연금저축)의 우선순위를 낮췄습니다.";
    else if (a.taxroom === "no") reason = "ISA·연금저축 한도 여유가 적어 절세계좌 우선순위를 낮췄습니다.";
    else if (level === "상") reason = "목적이 절세·노후이고 기간이 충분해 절세계좌(ISA, 연금저축) 활용 우선순위를 높였습니다.";
    else reason = "";
    return { level: level, reason: reason };
  }

  function lossText(v) { return v === "0" ? "원금 보존" : v === "20" ? "-20% 이상" : "-" + v + "%"; }

  return { diagnose: diagnose, normalize: normalize };
});
