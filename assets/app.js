(function () {
  "use strict";
  var P = window.LAB_PRODUCTS, G = window.LAB_GROUPS, E = window.LabEngine;
  var state = { ind: null, rules: null };
  var $app = document.getElementById("app");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(v, d) { return Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function prod(id) { return P.filter(function (p) { return p.id === id; })[0]; }

  /* ---------- 지표 계산 ---------- */
  function latest(id) {
    var s = state.ind && state.ind.series[id];
    if (!s || !s.points.length) return null;
    var pts = s.points, last = pts[pts.length - 1], prev = pts.length > 1 ? pts[pts.length - 2] : null;
    var isRate = s.unit === "%";
    var diff = prev ? last[1] - prev[1] : 0;
    var txt, cls = Math.abs(diff) < 1e-9 ? "flat" : diff > 0 ? "up" : "down";
    if (!prev) txt = "";
    else if (isRate) txt = (diff > 0 ? "▲ " : diff < 0 ? "▼ " : "– ") + fmt(Math.abs(diff) * 100, 1) + "bp";
    else txt = (diff > 0 ? "▲ " : diff < 0 ? "▼ " : "– ") + fmt(Math.abs(diff / prev[1]) * 100, 2) + "%";
    return { s: s, date: last[0], value: last[1], text: fmt(last[1], s.digits), chg: txt, cls: cls };
  }

  /* ---------- SVG 차트 ---------- */
  var RANGES = [["1M", 31], ["3M", 92], ["1Y", 366], ["5Y", 0]];
  function slice(s, days) {
    if (!days || s.points.length < 3) return s.points;
    var last = new Date(s.points[s.points.length - 1][0] + "T00:00:00");
    var cut = new Date(last.getTime() - days * 86400000).toISOString().slice(0, 10);
    var out = s.points.filter(function (p) { return p[0] >= cut; });
    return out.length >= 2 ? out : s.points.slice(-2);
  }
  function spark(id) {
    var s = state.ind.series[id]; if (!s || s.points.length < 2) return "";
    var v = s.points.slice(-60).map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), r = hi - lo || 1;
    var pts = v.map(function (y, i) { return [(i / (v.length - 1)) * 200, 40 - ((y - lo) / r) * 34]; });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var l = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + d + ' L200 44 L0 44 Z" fill="var(--pink)" opacity=".10"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--pink)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' +
      '<circle cx="' + l[0] + '" cy="' + l[1].toFixed(1) + '" r="3" fill="var(--pink)" vector-effect="non-scaling-stroke"/></svg>';
  }
  function chartGeom(pts) {
    var v = pts.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.01 || 1;
    return { v: v, lo: lo - pad, hi: hi + pad, W: 600, H: 190, L: 46, R: 12, T: 12, B: 26 };
  }
  function chartInner(id, days) {
    var s = state.ind.series[id], pts = slice(s, days), g = chartGeom(pts), v = g.v;
    var X = function (i) { return g.L + (i / (v.length - 1)) * (g.W - g.L - g.R); };
    var Y = function (y) { return g.T + (1 - (y - g.lo) / (g.hi - g.lo)) * (g.H - g.T - g.B); };
    var d = v.map(function (y, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(y).toFixed(1); }).join(" ");
    var grid = [0, 0.5, 1].map(function (t) {
      var y = g.T + t * (g.H - g.T - g.B), val = g.hi - t * (g.hi - g.lo);
      return '<line x1="' + g.L + '" x2="' + (g.W - g.R) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)"/>' +
        '<text x="' + (g.L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="var(--mut)" font-family="monospace">' + fmt(val, s.digits > 2 ? 2 : s.digits) + '</text>';
    }).join("");
    var long = s.points.length > 15;
    var ranges = long ? '<div class="ranges" role="group" aria-label="기간 선택">' + RANGES.map(function (r) {
      return '<button type="button" data-days="' + r[1] + '" aria-pressed="' + (r[1] === days) + '">' + r[0] + "</button>";
    }).join("") + "</div>" : "";
    return ranges + '<svg class="bigchart" viewBox="0 0 ' + g.W + " " + g.H + '" role="img" aria-label="' + esc(s.name) + ' 추이 차트" data-id="' + id + '" data-days="' + days + '">' + grid +
      '<path d="' + d + " L" + X(v.length - 1) + " " + (g.H - g.B) + " L" + g.L + " " + (g.H - g.B) + ' Z" fill="var(--pink)" opacity=".10"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--pink)" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<line class="cur" x1="0" x2="0" y1="' + g.T + '" y2="' + (g.H - g.B) + '" stroke="var(--navy)" stroke-dasharray="3 3" opacity="0"/>' +
      '<circle class="dot" r="4.5" fill="var(--pink)" stroke="#fff" stroke-width="2" opacity="0"/>' +
      '<text x="' + g.L + '" y="' + (g.H - 6) + '" font-size="11" fill="var(--mut)" font-family="monospace">' + pts[0][0] + '</text>' +
      '<text x="' + (g.W - g.R) + '" y="' + (g.H - 6) + '" text-anchor="end" font-size="11" fill="var(--mut)" font-family="monospace">' + pts[pts.length - 1][0] + '</text></svg>' +
      '<div class="tip">그래프 위에 마우스를 올리면 날짜별 값이 보입니다.</div>';
  }
  function bigChart(id) {
    var s = state.ind.series[id]; if (!s || s.points.length < 2) return '<div class="ph">데이터가 부족해 차트를 그릴 수 없습니다.</div>';
    var days = s.points.length > 15 ? 366 : 0;
    return '<div class="chartbox" data-id="' + id + '">' + chartInner(id, days) + "</div>";
  }
  function wireBox(box) {
    var id = box.getAttribute("data-id"), s = state.ind.series[id];
    Array.prototype.forEach.call(box.querySelectorAll(".ranges button"), function (b) {
      b.addEventListener("click", function () { box.innerHTML = chartInner(id, Number(b.getAttribute("data-days"))); wireBox(box); });
    });
    var svg = box.querySelector("svg.bigchart"), tip = box.querySelector(".tip");
    var pts = slice(s, Number(svg.getAttribute("data-days"))), g = chartGeom(pts);
    function move(ev) {
      var rect = svg.getBoundingClientRect(), cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      if (!rect.width) return;
      var x = ((cx - rect.left) / rect.width) * g.W;
      var i = Math.max(0, Math.min(pts.length - 1, Math.round(((x - g.L) / (g.W - g.L - g.R)) * (pts.length - 1))));
      var p = pts[i], X = g.L + (i / (pts.length - 1)) * (g.W - g.L - g.R);
      var Y = g.T + (1 - (p[1] - g.lo) / (g.hi - g.lo)) * (g.H - g.T - g.B);
      var cur = svg.querySelector(".cur"), dot = svg.querySelector(".dot");
      cur.setAttribute("x1", X); cur.setAttribute("x2", X); cur.setAttribute("opacity", 1);
      dot.setAttribute("cx", X); dot.setAttribute("cy", Y); dot.setAttribute("opacity", 1);
      tip.textContent = p[0] + "  " + fmt(p[1], s.digits) + s.unit;
    }
    svg.addEventListener("mousemove", move);
    svg.addEventListener("touchmove", move, { passive: true });
    svg.addEventListener("touchstart", move, { passive: true });
  }
  function wireCharts() {
    Array.prototype.forEach.call(document.querySelectorAll(".chartbox"), wireBox);
  }

  /* ---------- 공통 조각 ---------- */
  function indCard(id) {
    var L = latest(id); if (!L) return "";
    return '<a class="card ind" href="#/indicator/' + id + '"><div class="nm">' + esc(L.s.name) + '</div>' +
      '<div class="vl">' + L.text + '<small>' + esc(L.s.unit) + '</small></div>' +
      '<div class="chg ' + L.cls + '">' + (L.chg || "&nbsp;") + ' <span class="meta">전일 대비</span></div>' + spark(id) +
      (L.s.stale ? '<div class="stale">수집 실패로 직전 값을 표시 중</div>' : "") + '</a>';
  }
  function pcard(p) {
    var g = G[p.group];
    return '<a class="card pcard" href="#/product/' + p.id + '"><span class="pill" style="background:' + g.color + '">' + esc(g.name) + '</span>' +
      '<h3>' + esc(p.name) + '</h3><div class="tagline">' + esc(p.tag) + '</div><p style="margin-top:8px">' + esc(p.summary) + '</p></a>';
  }
  function asOf() {
    var ind = state.ind, dates = Object.keys(ind.series).map(function (k) { var s = ind.series[k]; return s.points.length ? s.points[s.points.length - 1][0] : ""; });
    var d = dates.sort().pop();
    var mode = ind.mode === "sample" ? " · 샘플 키 수집(최근 10영업일)" : " · 최근 5년 일별";
    return "기준일 " + d + " · 출처 " + ind.source + mode;
  }

  /* ---------- 뷰 ---------- */
  function viewHome() {
    var ids = Object.keys(state.ind.series);
    return '<section class="hero"><div class="bubble b1"></div><div class="bubble b2"></div><div class="bubble b3"></div><div class="wrap">' +
      '<div class="eyebrow">Asset Management · Lab</div><h1>시장을 읽고,<br>나에게 맞는 <em>상품군</em>을 실험하다</h1>' +
      '<p>금융상품 12종을 시장 지표와 함께 살펴보고, 1분 진단으로 상품군별 적합도와 자산배분 비중을 확인해 보세요.</p>' +
      '<a class="btn" href="#/diagnose">진단 시작하기 →</a><a class="btn ghost" href="#/products">상품 둘러보기</a></div></section>' +
      '<main class="wrap"><section class="sec"><h2><span class="no">EXP 01</span>시장 지표 모니터</h2>' +
      '<p class="sub">상품에 영향을 주는 핵심 지표입니다. 카드를 누르면 추이를 볼 수 있습니다. <span class="meta">' + esc(asOf()) + '</span></p>' +
      '<div class="grid g4">' + ids.map(indCard).join("") + '</div></section>' +
      '<section class="sec"><h2><span class="no">EXP 02</span>실험 메뉴</h2><p class="sub">키움랩에서 시험 중인 기능입니다.</p><div class="grid g3">' +
      '<a class="card pcard" href="#/diagnose"><span class="pill" style="background:var(--pink)">진단</span><h3>맞춤 자산배분 진단</h3><p style="margin-top:8px">목적·기간·손실 감내도를 입력하면 상품군별 적합도와 비중을 계산합니다. 입력값은 이 브라우저 안에서만 처리됩니다.</p></a>' +
      '<a class="card pcard" href="#/products"><span class="pill" style="background:var(--navy)">상품</span><h3>금융상품 12종</h3><p style="margin-top:8px">RP, 채권, ELS, 펀드, Wrap, ISA 등 상품별 특징과 유의점, 관련 지표를 한곳에서 봅니다.</p></a>' +
      '</div></section></main>';
  }

  function viewProducts() {
    var html = '<main class="wrap"><section class="sec"><h2><span class="no">CATALOG</span>금융상품 12종</h2><p class="sub">상품 유형에 대한 일반 설명입니다. 실제 금리·수수료·약관은 키움증권 공식 안내를 확인하세요.</p>';
    ["liquid", "income", "market", "tax"].forEach(function (gid) {
      var g = G[gid];
      html += '<div class="grouphead"><i class="dot" style="background:' + g.color + '"></i><h3>' + esc(g.name) + '</h3><span>' + esc(g.desc) + '</span></div><div class="grid g3">' +
        P.filter(function (p) { return p.group === gid; }).map(pcard).join("") + "</div>";
    });
    return html + "</section></main>";
  }

  function viewProduct(id) {
    var p = prod(id); if (!p) return viewNotFound();
    var g = G[p.group];
    var inds = p.indicators.map(function (i) {
      var L = latest(i); if (!L) return "";
      return '<div class="card"><div class="nm meta">' + esc(L.s.name) + '</div><div class="vl" style="font:700 22px var(--mono)">' + L.text + esc(L.s.unit) + ' <span class="chg ' + L.cls + '">' + L.chg + '</span></div>' + bigChart(i) + '</div>';
    }).join("");
    return '<main class="wrap detail"><div class="crumb"><a href="#/products">상품</a> / ' + esc(g.name) + '</div>' +
      '<span class="pill" style="background:' + g.color + '">' + esc(g.name) + '</span><h1>' + esc(p.name) + '</h1><p style="max-width:680px">' + esc(p.summary) + '</p>' +
      '<div class="lists"><div class="card"><h4>특징</h4><ul>' + p.points.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul></div>' +
      '<div class="card warn"><h4>유의할 점</h4><ul>' + p.cautions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul></div></div>' +
      '<section class="sec"><h2><span class="no">DATA</span>관련 시장 지표</h2>' +
      (inds ? '<div class="grid g2">' + inds + "</div>" : '<p class="sub">이 상품은 시장 지표보다 세제·계좌 조건이 핵심입니다. 진단에서 절세계좌 활용 우선순위를 확인하세요.</p>') +
      '<div class="ph" style="margin-top:14px"><b>PLACEHOLDER</b> · 키움 상품의 실제 금리·수익률·수수료는 데이터 연동 후 이 영역에 표시됩니다.</div></section>' +
      '<div class="actions" style="margin-top:20px"><a class="btn" href="#/diagnose">나에게 맞는지 진단하기</a></div></main>';
  }

  function viewIndicator(id) {
    var L = latest(id); if (!L) return viewNotFound();
    var users = P.filter(function (p) { return p.indicators.indexOf(id) >= 0; });
    return '<main class="wrap detail"><div class="crumb"><a href="#/">홈</a> / 시장 지표</div><h1>' + esc(L.s.name) + '</h1>' +
      '<div class="vl" style="font:700 30px var(--mono)">' + L.text + esc(L.s.unit) + ' <span class="chg ' + L.cls + '">' + L.chg + '</span></div>' +
      '<p class="meta">' + esc(asOf()) + '</p><div class="card">' + bigChart(id) + '</div>' +
      '<section class="sec"><h2><span class="no">LINK</span>이 지표와 관련된 상품</h2><div class="grid g3">' + users.map(pcard).join("") + "</div></section></main>";
  }

  function viewDiagnose() {
    var qs = state.rules.questions;
    var html = '<main class="wrap"><section class="sec"><h2><span class="no">EXP 03</span>맞춤 자산배분 진단</h2>' +
      '<p class="sub">7문항 · 약 1분. 입력값은 서버로 전송되거나 저장되지 않고 이 브라우저 안에서만 계산됩니다.</p>' +
      '<div class="stepbar"><i id="bar" style="width:0%"></i></div><form id="dx" novalidate>';
    qs.forEach(function (q, i) {
      html += '<fieldset class="q" style="border:0;padding:0;margin:0 0 20px"><legend class="ql"><span class="qn">Q' + (i + 1) + '</span>' + esc(q.label) + '</legend><div class="opts">' +
        q.options.map(function (o) { return '<label class="opt"><input type="radio" name="' + q.id + '" value="' + o.v + '"><span>' + esc(o.t) + "</span></label>"; }).join("") + "</div></fieldset>";
    });
    html += '<div class="actions"><button class="btn" type="submit">결과 보기</button><button class="btn line" type="reset">다시 입력</button><span class="hint" id="dxhint"></span></div></form>' +
      '<div id="dxout" aria-live="polite"></div></section></main>';
    return html;
  }

  function ctxLine(gid) {
    var g = state.rules.groups.filter(function (x) { return x.id === gid; })[0];
    return g.indicators.map(function (i) { var L = latest(i); return L ? L.s.name + " " + L.text + L.s.unit : ""; }).filter(Boolean).join("  ·  ");
  }

  function renderResult(a) {
    var r = E.diagnose(a, state.rules), order = ["liquid", "income", "market"];
    var R = 82, C = 2 * Math.PI * R, off = 0;
    var arcs = order.map(function (k) {
      var len = (r.weights[k] / 100) * C, s = '<circle r="' + R + '" cx="110" cy="110" fill="none" stroke="' + G[k].color + '" stroke-width="30" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 110 110)"/>';
      off += len; return s;
    }).join("");
    var donut = '<div class="card donutbox"><svg viewBox="0 0 220 220" role="img" aria-label="상품군별 추천 비중 도넛 차트"><circle r="' + R + '" cx="110" cy="110" fill="none" stroke="var(--line)" stroke-width="30"/>' + arcs +
      '<text x="110" y="106" text-anchor="middle" font-size="12" fill="var(--mut)">투자 성향</text><text x="110" y="130" text-anchor="middle" font-size="20" font-weight="800" fill="var(--tx)">' + esc(r.band.name) + '</text></svg>' +
      '<div class="score">위험 점수 ' + r.score + ' / 100</div><div class="legend">' +
      order.map(function (k) { return '<div><i style="background:' + G[k].color + '"></i>' + esc(G[k].name) + "<b>" + r.weights[k] + "%</b></div>"; }).join("") + "</div></div>";

    var cards = order.map(function (k) {
      var chips = P.filter(function (p) { return p.group === k; }).map(function (p) {
        var fxNote = r.fx && (p.id === "rp_fx" || p.id === "bond_fx") ? " ★" : "";
        return '<a class="chip" href="#/product/' + p.id + '">' + esc(p.name) + fxNote + "</a>";
      }).join("");
      return '<div class="fit" style="border-left-color:' + G[k].color + '"><h4>' + esc(G[k].name) + '<span class="lv">적합도 ' + r.fit[k] + " · " + r.weights[k] + '%</span></h4><p>' + esc(G[k].desc) + '</p>' +
        '<div class="ctx">현재 지표 · ' + esc(ctxLine(k)) + '</div><div class="chips">' + chips + "</div></div>";
    }).join("");
    var taxCard = '<div class="fit" style="border-left-color:' + G.tax.color + '"><h4>절세계좌 활용<span class="lv">우선순위 ' + r.tax.level + '</span></h4><p>ISA·연금저축은 상품이 아니라 위 상품들을 담는 계좌입니다. 비중과 별개로 활용 여부를 검토하세요.</p>' +
      '<div class="chips"><a class="chip" href="#/product/isa">ISA</a><a class="chip" href="#/product/pension">연금저축</a></div></div>';
    var fxNote = r.fx ? '<p class="hint">★ 외화 자산에 관심이 있어 외화RP·해외채권을 표시했습니다. 환율 변동 위험을 함께 고려하세요.</p>' : "";
    var why = '<div class="card"><h4 style="margin:0">이렇게 계산했어요</h4><ul class="why">' + r.reasons.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    var disc = '<div class="card warn"><b>안내</b><p style="margin:6px 0 0;font-size:13.5px">이 결과는 입력한 답변을 단순 규칙으로 계산한 <b>테스트용 참고 정보</b>이며, 투자 권유나 투자자문이 아닙니다. 실제 가입 전에는 상품설명서와 약관을 확인하고 투자성향 진단 등 정식 절차를 거치세요. 투자에는 원금 손실이 발생할 수 있습니다.</p></div>';
    return '<div style="margin-top:26px"><h2 style="margin:0 0 12px;font-size:20px">진단 결과</h2><div class="result">' + donut + '<div class="grid">' + cards + taxCard + fxNote + why + "</div></div><div style=\"margin-top:14px\">" + disc + "</div></div>";
  }

  function wireDiagnose() {
    var f = document.getElementById("dx"), bar = document.getElementById("bar"), hint = document.getElementById("dxhint"), out = document.getElementById("dxout");
    var qs = state.rules.questions;
    function answers() {
      var a = {}, fd = new FormData(f);
      qs.forEach(function (q) { a[q.id] = fd.get(q.id); });
      return a;
    }
    function progress() {
      var a = answers(), n = qs.filter(function (q) { return a[q.id]; }).length;
      bar.style.width = (n / qs.length) * 100 + "%"; return n;
    }
    f.addEventListener("change", progress);
    f.addEventListener("reset", function () { setTimeout(function () { progress(); out.innerHTML = ""; hint.textContent = ""; }, 0); });
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var a = answers(), miss = qs.filter(function (q) { return !a[q.id]; });
      if (miss.length) { hint.textContent = "아직 답하지 않은 문항이 있어요: " + miss.map(function (q) { return q.label; }).join(", "); return; }
      hint.textContent = ""; out.innerHTML = renderResult(a);
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function viewNotFound() { return '<main class="wrap"><div class="empty"><h2>페이지를 찾을 수 없어요</h2><a class="btn" href="#/">홈으로</a></div></main>'; }

  /* ---------- 라우터 ---------- */
  function route() {
    var h = (location.hash || "#/").replace(/^#\/?/, ""), parts = h.split("/"), key = parts[0] || "home", html, title = "키움랩";
    if (key === "home") html = viewHome();
    else if (key === "products") { html = viewProducts(); title = "상품 12종 · " + title; }
    else if (key === "product") { html = viewProduct(parts[1]); var p = prod(parts[1]); if (p) title = p.name + " · " + title; }
    else if (key === "indicator") { html = viewIndicator(parts[1]); title = "시장 지표 · " + title; }
    else if (key === "diagnose") { html = viewDiagnose(); title = "맞춤 진단 · " + title; }
    else html = viewNotFound();
    $app.innerHTML = html; document.title = title;
    Array.prototype.forEach.call(document.querySelectorAll("nav a"), function (a) {
      var on = a.getAttribute("data-r") === (key === "product" ? "products" : key === "indicator" ? "home" : key);
      a.classList.toggle("on", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (key === "diagnose") wireDiagnose();
    wireCharts(); window.scrollTo(0, 0);
  }

  function fail(msg) { $app.innerHTML = '<main class="wrap"><div class="empty"><h2>데이터를 불러오지 못했어요</h2><p>' + esc(msg) + '</p><p class="meta">파일로 직접 열지 말고 웹 주소(또는 로컬 서버)로 접속해 주세요.</p></div></main>'; }

  Promise.all([
    fetch("data/indicators.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("지표 데이터 " + r.status); return r.json(); }),
    fetch("data/rules.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("규칙 데이터 " + r.status); return r.json(); })
  ]).then(function (res) {
    state.ind = res[0]; state.rules = res[1];
    document.getElementById("asof").textContent = asOf();
    window.addEventListener("hashchange", route); route();
  }).catch(function (e) { fail(e.message); });
})();
