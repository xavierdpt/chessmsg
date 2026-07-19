(function () {
  "use strict";

  const FILES = ["a","b","c","d","e","f","g","h"];

  const PREFS = {
    A1_CLEAR_SOURCE_ON_OPP_NOT_DEST:  true,
    A11_TAPS_ALLOWED_DURING_SEARCH:   true,

    ENABLE_PROMOTION_POPUP:           true,
    PROMOTION_DEFAULT_PIECE:          "q",
    PROMOTION_CANCEL_CLEARS_SOURCE:   true,
    PROMOTION_PIECE_ORDER:            ["q", "r", "b", "n"],
    ROW_LIST_SHOWS_ALL_PROMOTIONS:    false,

    HIGHLIGHT_STYLE:                  "ring",
    HAPTIC_ON_PROMOTION_PICK:         false,

    SOURCE_TOGGLE_REQUIRES_SAME_SQ:   true,
    RESIZE_REDRAWS_ARROW:             true,
    PROMOTE_REQUIRES_PAWN_ON_7TH:     true,

    DISCORD_BUTTON_MODE:              "widget",
    DISCORD_INVITE_SLUG:              "chessmsg",
    DISCORD_WIDGET_ID:                "1528008721853186191",
  };

  function pieceImageSrc(cell) {
    const colorPart = cell.color === "w" ? "w" : "b";
    const typePart = cell.type.toUpperCase();
    return "img/pieces/" + colorPart + typePart + ".png";
  }

  function promotionImageSrc(color, pieceCode) {
    return "img/pieces/" + (color === "w" ? "w" : "b") + pieceCode.toUpperCase() + ".png";
  }

  let chess, baseChess, san, pickedSan, rowData, sourceSq;
  const $ = (s) => document.querySelector(s);

  function isPromotionMove(fromUci, toUci) {
    if (!PREFS.PROMOTE_REQUIRES_PAWN_ON_7TH) return false;
    const fromCell = baseChess.get(fromUci);
    if (!fromCell || fromCell.type !== "p") return false;
    const turn = baseChess.turn();
    const toRank = parseInt(toUci[1], 10);
    if (turn === "w") return fromUci[1] === "7" && toRank === 8;
    return fromUci[1] === "2" && toRank === 1;
  }

  function destSquaresFrom(fromUci) {
    const out = [];
    const verbose = baseChess.moves({ verbose: true });
    for (const m of verbose) {
      if (m.from !== fromUci) continue;
      out.push(m.to);
    }
    return out;
  }

  function rowForSourceDest(fromUci, toUci) {
    const prefix = fromUci + toUci;
    const queenOnly = rowData.find((r) => r.uci === prefix + "q");
    if (queenOnly) return queenOnly;
    return rowData.find((r) => r.uci.slice(0, 4) === prefix);
  }

  function rowIndexForSan(s) {
    if (!s) return -1;
    return rowData.findIndex((r) => r.san === s);
  }

  function parseInitialSan() {
    const v = new URLSearchParams(location.search).get("san");
    return v ? v.split(/[\s,]+/).filter(Boolean) : [];
  }

  function replaySan(chess, list) {
    for (const m of list) {
      const r = chess.move(m);
      if (!r) return false;
    }
    return true;
  }

  function cellIndex(f, r) {
    const fileIdx = FILES.indexOf(f);
    const rank = Number(r);
    if (baseChess.turn() === "b") return (rank - 1) * 8 + (7 - fileIdx);
    return (8 - rank) * 8 + fileIdx;
  }
  function idxToSq(i) {
    const fileIdx = i % 8;
    const rowIdx = Math.floor(i / 8);
    if (baseChess.turn() === "b") return FILES[7 - fileIdx] + (rowIdx + 1);
    return FILES[fileIdx] + (8 - rowIdx);
  }
  function boardFlipped() {
    return baseChess.turn() === "b";
  }
  function sqXY(idx, cellPx) {
    return {
      x: (idx % 8) * cellPx,
      y: Math.floor(idx / 8) * cellPx,
    };
  }

  function buildBoard() {
    const board = $("#board");
    board.innerHTML = "";
    const rows = chess.board();
    const flipped = boardFlipped();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const rankRow = flipped ? (7 - r) : r;
        const fileIdx = flipped ? (7 - f) : f;
        const cell = rows[rankRow][fileIdx];
        const sq = document.createElement("div");
        sq.className = "sq " + (((rankRow + fileIdx) % 2 === 0) ? "light" : "dark");
        const uci = flipped
          ? FILES[7 - f] + (r + 1)
          : FILES[f] + (8 - r);
        sq.dataset.uci = uci;
        sq.dataset.idx = (r * 8 + f);
        sq.onclick = function () { onSquareClick(sq.dataset.uci); };
        if (cell) {
          const span = document.createElement("span");
          span.className = "p";
          const img = document.createElement("img");
          img.src = pieceImageSrc(cell);
          img.alt = cell.color + cell.type;
          img.draggable = false;
          span.appendChild(img);
          sq.appendChild(span);
        }
        board.appendChild(sq);
      }
    }
  }

  function dumpArrowDrawing(fromIdx, toIdx, path, rawPts, svgEl, cellPx) {
    try {
      const boardEl = $("#board");
      const allSquares = boardEl ? Array.from(boardEl.children) : [];
      const srcSq = allSquares[fromIdx];
      const dstSq = allSquares[toIdx];
      const rectOf = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
          centerX: Math.round(r.left + r.width / 2),
          centerY: Math.round(r.top + r.height / 2),
        };
      };
      const srcRect = rectOf(srcSq);
      const dstRect = rectOf(dstSq);
      const svgRect = rectOf(svgEl);
      const pathRect = rectOf(path);
      const ctm = svgEl.getScreenCTM();
      const screenPts = rawPts.map((p) => {
        const sp = svgEl.createSVGPoint();
        sp.x = p[0];
        sp.y = p[1];
        const m = sp.matrixTransform(ctm);
        return { userX: +p[0].toFixed(2), userY: +p[1].toFixed(2), screenX: Math.round(m.x), screenY: Math.round(m.y) };
      });
      console.log("[arrow-drawing] " + JSON.stringify({
        fromIdx, toIdx,
        fromUci: idxToSq(fromIdx),
        toUci: idxToSq(toIdx),
        cellPx: +cellPx.toFixed(2),
        viewBox: svgEl.getAttribute("viewBox"),
        sourceSquare: srcRect,
        targetSquare: dstRect,
        svgRect,
        pathRect,
        points: screenPts,
      }));
    } catch (e) {
      console.log("[arrow-drawing] " + JSON.stringify({ error: String(e && e.message || e) }));
    }
  }

  function drawArrow(fromIdx, toIdx) {
    const wrap = $("#board-wrap");
    const cellPx = wrap.clientWidth / 8;
    if (!cellPx) return;
    const a = sqXY(fromIdx, cellPx);
    const b = sqXY(toIdx,   cellPx);
    const svg = $("#arrows");
    svg.setAttribute("viewBox", "0 0 " + (cellPx * 8) + " " + (cellPx * 8));
    svg.innerHTML = "";
    const stemWidth = cellPx / 6;
    const headWidth = cellPx / 2.4;
    const headLength = cellPx / 2.4;
    const x1 = a.x + cellPx/2, y1 = a.y + cellPx/2;
    const x2 = b.x + cellPx/2, y2 = b.y + cellPx/2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    const neckLen = Math.max(0, len - headLength);
    const neckX = x1 + ux * neckLen;
    const neckY = y1 + uy * neckLen;
    const pts = [
      [x1 + nx * stemWidth / 2,         y1 + ny * stemWidth / 2],
      [neckX + nx * stemWidth / 2,      neckY + ny * stemWidth / 2],
      [neckX + nx * headWidth / 2,      neckY + ny * headWidth / 2],
      [x2,                              y2],
      [neckX - nx * headWidth / 2,      neckY - ny * headWidth / 2],
      [neckX - nx * stemWidth / 2,      neckY - ny * stemWidth / 2],
      [x1 - nx * stemWidth / 2,         y1 - ny * stemWidth / 2],
    ];
    const d = "M" + pts.map((p) => p.join(",")).join(" ") + " Z";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    dumpArrowDrawing(fromIdx, toIdx, path, pts, svg, cellPx);
  }

  function clearArrows() { $("#arrows").innerHTML = ""; }

  function fmtScore(label, turn) {
    if (!label) return "-";
    let num;
    if (label.kind === "cp") {
      num = label.value;
      if (turn === "b") num = -num;
      return "cp " + (num >= 0 ? "+" : "") + (num / 100).toFixed(2);
    }
    num = label.value;
    if (turn === "b") num = -num;
    return "mate " + (num >= 0 ? "+" : "") + num;
  }

  function rankKey(label) {
    if (!label) return -Infinity;
    const n = label.value;
    if (label.kind === "mate") {
      return n >= 0 ? 100000 - n : -100000 - n;
    }
    return n;
  }

  function loadMoveRows() {
    const verbose = baseChess.moves({ verbose: true });
    const out = [];
    for (const m of verbose) {
      const fromIdx = cellIndex(m.from[0], m.from[1]);
      const toIdx   = cellIndex(m.to[0],   m.to[1]);
      if (m.promotion && PREFS.ROW_LIST_SHOWS_ALL_PROMOTIONS) {
        const suffixes = PREFS.PROMOTION_PIECE_ORDER;
        for (const piece of suffixes) {
          out.push({
            san: m.san.replace(/=./, "=" + piece.toUpperCase()),
            uci: m.from + m.to + piece,
            fromIdx,
            toIdx,
            label: null,
          });
        }
      } else {
        out.push({
          san: m.san,
          uci: m.from + m.to + (m.promotion || ""),
          fromIdx,
          toIdx,
          label: null,
        });
      }
    }
    rowData = out;
  }

  function cpBarWidth(label) {
    if (!label || label.kind !== "cp") return null;
    const pct = 50 - label.value / 20;
    return Math.max(0, Math.min(100, pct));
  }

  function runKeyTest() {
    console.group("[K] cpBarWidth validation test");
    console.log("[K] formula: pct = 50 - label.value / 20 (raw Cp from white's perspective).");
    console.log("[K] fenkbsan reference: scoreBlackPartWidth = 50 + 100 * move.score / 20 with move.score = -value/100, equivalent to 50 - value/20.");
    const cases = [
      { label: "g4 (cp -0.98, w-to-m)",  rawCp:  -98, turn: "w" },
      { label: "cp -0.14 row, w-to-m",   rawCp:  -14, turn: "w" },
      { label: "cp +0.09 row, w-to-m",   rawCp:   +9, turn: "w" },
      { label: "cp +0.12 row, w-to-m",   rawCp:  +12, turn: "w" },
      { label: "cp +0.25 row, w-to-m",   rawCp:  +25, turn: "w" },
      { label: "cp +0.43 row, w-to-m",   rawCp:  +43, turn: "w" },
      { label: "cp -0.43 row, w-to-m",   rawCp:  -43, turn: "w" },
      { label: "cp +1.00, w-to-m",       rawCp: +100, turn: "w" },
      { label: "cp -1.00, w-to-m",       rawCp: -100, turn: "w" },
      { label: "cp +3.00, w-to-m",       rawCp: +300, turn: "w" },
      { label: "cp -3.00, w-to-m",       rawCp: -300, turn: "w" },
      { label: "e4 (cp +0.X, w-to-m) X=80", rawCp:  +80, turn: "w" },
      { label: "e4 (cp +0.X, b-to-m) X=80", rawCp:  +80, turn: "b" },
    ];
    console.log("[K] " + JSON.stringify({ name: "formula-compare", note: "old = 50 + 50 * (value/100) flipped with turn; new = 50 - value/20" }));
    for (const c of cases) {
      const label = { kind: "cp", value: c.rawCp };
      let pawns = c.rawCp / 100;
      if (c.turn === "b") pawns = -pawns;
      const oldPct = Math.max(0, Math.min(100, 50 + 50 * pawns));
      const newPctFn = (function () {
        const pct = 50 - c.rawCp / 20;
        return Math.max(0, Math.min(100, pct));
      })();
      console.log("[K] " + JSON.stringify({
        name: "row",
        label: c.label,
        rawCp: c.rawCp,
        turn: c.turn,
        oldPct: +oldPct.toFixed(2),
        newPct: +newPctFn.toFixed(2),
        delta: +(newPctFn - oldPct).toFixed(2),
      }));
    }
    console.log("[K] live SAN replay: d4,d5,Bh6 (Bh6 is a terrible white move)");
    try {
      const t = new Chess();
      for (const m of ["d4", "d5", "Bh6"]) {
        const r = t.move(m);
        if (!r) { console.log("[K] FAILED to play " + m); break; }
        console.log("[K] played " + m + ", to-move=" + t.turn() + ", fen=" + t.fen());
      }
      const legal = t.moves({ verbose: true });
      console.log("[K] " + JSON.stringify({ name: "after-bh6", turn: t.turn(), fen: t.fen(), legalCount: legal.length }));
      const syntheticRawCp = {
        "e5":  -180,
        "Nc6": -190,
        "Nf6": -150,
        "c5":  -220,
        "g6":  -160,
        "Nxh6":+200,
        "Bf5": -240,
        "a6":  -260,
      };
      console.log("[K] " + JSON.stringify({ name: "synthetic-cp-table", note: "synthetic scores simulating that Bh6 nets ~ -180 cp for white (black winning). Nxh6 captures the bishop and is bad for black, hence +200 cp. The bar widths must reflect that black advantage > 50% and switch to < 50% only when black blunders." }));
      for (const m of legal) {
        const rawCp = syntheticRawCp[m.san] != null ? syntheticRawCp[m.san] : -180;
        const label = { kind: "cp", value: rawCp };
        const pct = cpBarWidth(label);
        console.log("[K] " + JSON.stringify({
          name: "post-bh6-row",
          san: m.san,
          uci: m.from + m.to + (m.promotion || ""),
          turn: t.turn(),
          syntheticCp: rawCp,
          barWidthPct: pct,
          verdict: pct > 50 ? "black winning (more fill)" : (pct < 50 ? "white winning (less fill)" : "equal"),
        }));
      }
    } catch (e) {
      console.log("[K] exception during live SAN replay: " + (e && e.message ? e.message : e));
    }
    console.groupEnd();
  }

  function mateCells(label, turn) {
    if (!label || label.kind !== "mate") return null;
    let n = label.value;
    if (turn === "b") n = -n;
    const sign = n >= 0 ? "good" : "bad";
    const count = Math.min(8, Math.abs(n));
    return { count, sign };
  }

  function makeRow(idx, row) {
    const turn = baseChess.turn();
    const isSelected = row.san === pickedSan;
    const el = document.createElement("div");
    el.className = "row" + (isSelected ? " selected" : "");

    const sanSpan = document.createElement("span");
    sanSpan.className = "san";
    sanSpan.textContent = row.san;
    el.appendChild(sanSpan);

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "score";
    scoreSpan.textContent = fmtScore(row.label, turn);
    el.appendChild(scoreSpan);

    const barWidth = cpBarWidth(row.label);
    const cells = mateCells(row.label, turn);
    if (barWidth !== null) {
      const bar = document.createElement("span");
      bar.className = "score-bar";
      const fill = document.createElement("span");
      fill.className = "score-bar-fill";
      fill.style.width = barWidth.toFixed(2) + "%";
      bar.appendChild(fill);
      el.appendChild(bar);
    } else if (cells) {
      const wrap = document.createElement("span");
      wrap.className = "score-cells " + cells.sign;
      for (let i = 0; i < cells.count; i++) {
        const cell = document.createElement("span");
        cell.className = "score-cell";
        wrap.appendChild(cell);
      }
      el.appendChild(wrap);
    }

    return el;
  }

  function renderMoveList() {
    const list = $("#moves");
    list.innerHTML = "";
    rowData.forEach((row, idx) => list.appendChild(makeRow(idx, row)));
    layoutRowBars();
    renderMinibar();
  }

  function renderMinibar() {
    const bar = $("#minibar");
    if (!bar) return;
    bar.innerHTML = "";
    if (!rowData) return;
    for (const row of rowData) {
      const rect = document.createElement("span");
      rect.className = "mini-rect";
      rect.dataset.san = row.san;
      bar.appendChild(rect);
    }
    applyMinibarSelection();
    layoutMinibar();
  }

  function applyMinibarSelection() {
    const bar = $("#minibar");
    if (!bar) return;
    const rects = bar.querySelectorAll(".mini-rect");
    rects.forEach((r) => r.classList.remove("on"));
    if (!pickedSan) return;
    for (const r of rects) {
      if (r.dataset.san === pickedSan) {
        r.classList.add("on");
        break;
      }
    }
  }

  function layoutMinibar() {
    const bar = $("#minibar");
    const wrap = $("#moves-wrap");
    const list = $("#moves");
    if (!bar || !wrap || !list) return;
    const rects = bar.children;
    const n = rects.length;
    if (!n) return;
    const H = wrap.clientHeight;
    if (!H) return;
    const scrollable = list.scrollHeight > wrap.clientHeight + 0.5;
    if (!scrollable) {
      const sample = list.querySelector(".row");
      const rowH = sample ? sample.offsetHeight : Math.round(H / n);
      if (!rowH) return;
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const h = (i === n - 1) ? Math.max(0, H - acc) : rowH;
        rects[i].style.height = h + "px";
        acc += h;
      }
    } else {
      const base = H / n;
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const h = (i === n - 1) ? Math.max(0, H - acc) : Math.floor(base);
        rects[i].style.height = h + "px";
        acc += h;
      }
    }
  }

  function updateEngineStatus() {
    const el = $("#engine-status");
    if (!el || !rowData) return;
    const total = rowData.length;
    let done = 0;
    for (const r of rowData) if (r.label) done++;
    if (total === 0 || done >= total) {
      el.hidden = true;
      el.textContent = "";
    } else {
      el.textContent = done + "/" + total;
      el.hidden = false;
    }
  }

  function layoutRowBars() {
  }

  function rerender() {
    buildBoard();
    applySquareHighlights();
    renderMoveList();
    updateEngineStatus();
    const activeRow = pickedSan ? rowData.find((r) => r.san === pickedSan) : null;
    if (activeRow) {
      drawArrow(activeRow.fromIdx, activeRow.toIdx);
    } else {
      clearArrows();
    }
    scrollActiveRowIntoView();
    updateShare();
  }

  function applySquareHighlights() {
    const style = PREFS.HIGHLIGHT_STYLE;
    const srcClass = style === "ring-yellow" ? "src-highlight-y" : "src-highlight";
    const dstClass = style === "ring-yellow" ? "dst-highlight-y" : "dst-highlight";
    const all = document.querySelectorAll("#board .sq");
    all.forEach((el) => {
      el.classList.remove(srcClass, dstClass);
    });
    if (!sourceSq) return;
    const src = document.querySelector('#board .sq[data-uci="' + cssEscape(sourceSq) + '"]');
    if (src) src.classList.add(srcClass);
    const dests = destSquaresFrom(sourceSq);
    for (const d of dests) {
      const el = document.querySelector('#board .sq[data-uci="' + cssEscape(d) + '"]');
      if (el) el.classList.add(dstClass);
    }
  }

  function cssEscape(s) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function scrollActiveRowIntoView() {
    if (!pickedSan) return;
    const list = $("#moves");
    if (!list) return;
    const rows = list.querySelectorAll(".row");
    for (const rowEl of rows) {
      const sanEl = rowEl.querySelector(".san");
      if (sanEl && sanEl.textContent === pickedSan) {
        if (typeof rowEl.scrollIntoView === "function") {
          rowEl.scrollIntoView({ block: "nearest" });
        }
        return;
      }
    }
  }

  function updateShare() {
    const btn = $("#share");
    btn.disabled = !pickedSan;
    btn.textContent = "Share";
  }

  function pickMove(idx) {
    const row = rowData[idx];
    if (!row) return;
    pickedSan = row.san;
    sourceSq = null;
    rerender();
  }

  function pickSyntheticPromotion(fromUci, toUci, pieceCode) {
    const res = baseChess.move({ from: fromUci, to: toUci, promotion: pieceCode });
    if (!res) {
      baseChess.undo();
      return false;
    }
    const san = res.san;
    baseChess.undo();
    pickedSan = san;
    sourceSq = null;
    rerender();
    drawArrow(
      cellIndex(fromUci[0], fromUci[1]),
      cellIndex(toUci[0],   toUci[1])
    );
    if (PREFS.HAPTIC_ON_PROMOTION_PICK && navigator.vibrate) {
      try { navigator.vibrate(20); } catch (_) {}
    }
    return true;
  }

  function onSquareClick(uci) {
    if (!uci) return;
    if (sfBusy && !PREFS.A11_TAPS_ALLOWED_DURING_SEARCH) return;

    const cell = baseChess.get(uci);
    const isMine = cell && cell.color === baseChess.turn();

    if (sourceSq) {
      if (uci === sourceSq) {
        sourceSq = null;
        if (PREFS.SOURCE_TOGGLE_REQUIRES_SAME_SQ) {
          rerender();
          return;
        }
      }
      if (isMine) {
        sourceSq = uci;
        rerender();
        return;
      }
      const dests = destSquaresFrom(sourceSq);
      const isDest = dests.indexOf(uci) !== -1;
      if (isDest) {
        if (isPromotionMove(sourceSq, uci)) {
          if (PREFS.ENABLE_PROMOTION_POPUP) {
            showPromotionPopup(sourceSq, uci);
            return;
          }
          pickSyntheticPromotion(sourceSq, uci, PREFS.PROMOTION_DEFAULT_PIECE);
          return;
        }
        const row = rowForSourceDest(sourceSq, uci);
        if (row) {
          const idx = rowIndexForSan(row.san);
          pickMove(idx);
          return;
        }
        sourceSq = null;
        rerender();
        return;
      }
      if (PREFS.A1_CLEAR_SOURCE_ON_OPP_NOT_DEST && cell && !isMine) {
        sourceSq = null;
        rerender();
        return;
      }
      sourceSq = null;
      rerender();
      return;
    }

    if (isMine) {
      sourceSq = uci;
      rerender();
      return;
    }
  }

  function showPromotionPopup(fromUci, toUci) {
    const popup = $("#promo-popup");
    if (!popup) {
      pickSyntheticPromotion(fromUci, toUci, PREFS.PROMOTION_DEFAULT_PIECE);
      return;
    }
    const buttonsWrap = popup.querySelector(".promo-buttons");
    const cancelBtn = popup.querySelector(".promo-cancel");
    if (!buttonsWrap) return;
    buttonsWrap.innerHTML = "";
    const color = baseChess.turn();
    popup.dataset.fromUci = fromUci;
    popup.dataset.toUci = toUci;
    for (const piece of PREFS.PROMOTION_PIECE_ORDER) {
      const btn = document.createElement("button");
      btn.type = "button";
      const img = document.createElement("img");
      img.src = promotionImageSrc(color, piece);
      img.alt = piece.toUpperCase();
      btn.appendChild(img);
      btn.addEventListener("click", function () {
        const f = popup.dataset.fromUci;
        const t = popup.dataset.toUci;
        hidePromotionPopup();
        const moveRes = baseChess.move({ from: f, to: t, promotion: piece });
        if (!moveRes) {
          baseChess.undo();
          return;
        }
        const movedSan = moveRes.san;
        baseChess.undo();
        const idx = rowIndexForSan(movedSan);
        if (idx >= 0) {
          pickMove(idx);
        } else {
          pickSyntheticPromotion(f, t, piece);
        }
      });
      buttonsWrap.appendChild(btn);
    }
    popup.classList.remove("hidden");
    if (cancelBtn) {
      cancelBtn.onclick = function () {
        hidePromotionPopup();
        if (PREFS.PROMOTION_CANCEL_CLEARS_SOURCE) {
          sourceSq = null;
          rerender();
        }
      };
    }
    popup.onclick = function (e) {
      if (e && e.target === popup) {
        hidePromotionPopup();
        if (PREFS.PROMOTION_CANCEL_CLEARS_SOURCE) {
          sourceSq = null;
          rerender();
        }
      }
    };
  }

  function hidePromotionPopup() {
    const popup = $("#promo-popup");
    if (!popup) return;
    popup.classList.add("hidden");
  }

  function isPromotionPopupOpen() {
    const popup = $("#promo-popup");
    return !!(popup && !popup.classList.contains("hidden"));
  }

  function cancelPromotionPopup() {
    hidePromotionPopup();
    if (PREFS.PROMOTION_CANCEL_CLEARS_SOURCE) {
      sourceSq = null;
      rerender();
    }
  }

  function shareUrl() {
    const u = new URL(location.href);
    if (!pickedSan) {
      u.search = san.length ? "?san=" + san.join(",") : "";
      return u.toString();
    }
    const full = san.concat([pickedSan]);
    u.search = full.length ? "?san=" + full.join(",") : "";
    return u.toString();
  }

  async function doShare() {
    if (!pickedSan) return;
    const url = shareUrl();
    const title = "It's your turn to move";
    const text = title + " — " + url;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        return;
      }
      window.prompt("Copy URL", url);
    } catch (_) {
      try {
        await navigator.clipboard.writeText(url);
      } catch (__) {
        window.prompt("Copy URL", url);
      }
    }
  }

  let sf = null;
  let sfReady = false;
  let sfBusy = false;
  let sfBusySan = null;
  let sfLastInfo = null;

  function handleEngineLine(line) {
    if (typeof line !== "string") return;
    if (line === "uciok") {
      sf.postMessage("isready");
    } else if (line === "readyok") {
      sfReady = true;
      pumpQueue();
    } else if (line.indexOf("info depth 15") === 0) {
      const m = /score (cp|mate) (-?\d+)/.exec(line);
      if (m) {
        sfLastInfo = { kind: m[1], value: parseInt(m[2], 10) };
      }
    } else if (line.indexOf("bestmove") === 0) {
      if (sfBusySan && sfLastInfo) {
        const idx = rowData.findIndex((r) => r.san === sfBusySan);
        if (idx >= 0 && !rowData[idx].label) {
          rowData[idx].label = sfLastInfo;
          rowData.sort((a, b) => rankKey(b.label) - rankKey(a.label));
          rerender();
        }
      }
      sfBusy = false;
      sfBusySan = null;
      sfLastInfo = null;
      pumpQueue();
    }
  }

  function pumpQueue() {
    if (!sfReady || sfBusy || !rowData) return;
    const next = rowData.find((r) => !r.label);
    if (!next) return;
    sfBusy = true;
    sfBusySan = next.san;
    sfLastInfo = null;
    sf.postMessage("position fen " + baseChess.fen());
    sf.postMessage("go depth 15 searchmoves " + next.uci);
  }

  function initStockfish() {
    if (sf) return;
    try {
      sf = new Worker("vendor/stockfish/stockfish-18-lite-single.js");
    } catch (e) {
      return;
    }
    sf.onmessage = function (e) {
      const data = e.data;
      if (typeof data === "string") {
        handleEngineLine(data);
      } else if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) handleEngineLine(data[i]);
      }
    };
    sf.postMessage("uci");
  }

  function openDiscordPopup() {
    const popup = $("#discord-popup");
    const frame = $("#discord-frame");
    const fallback = $("#discord-fallback");
    if (!popup || !frame || !fallback) return;

    const id = (PREFS.DISCORD_WIDGET_ID || "").trim();
    if (id && !frame.getAttribute("src")) {
      frame.src = "https://discord.com/widget?id="
                + encodeURIComponent(id)
                + "&theme=dark";
    }

    if (id) {
      frame.classList.remove("hidden");
      fallback.classList.add("hidden");
    } else {
      frame.classList.add("hidden");
      fallback.classList.remove("hidden");
    }

    popup.classList.remove("hidden");
    const closeBtn = $("#discord-close");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeDiscordPopup() {
    const popup = $("#discord-popup");
    if (!popup) return;
    popup.classList.add("hidden");
    const btn = $("#discord");
    if (btn) btn.focus({ preventScroll: true });
  }

  function initDiscord() {
    const btn = $("#discord");
    if (!btn) return;

    if (PREFS.DISCORD_BUTTON_MODE === "invite") {
      const url = "https://discord.gg/" + PREFS.DISCORD_INVITE_SLUG;
      btn.addEventListener("click", function () {
        window.open(url, "_blank", "noopener,noreferrer");
      });
      btn.setAttribute("aria-label", "Open the chessmsg Discord invite");
      btn.setAttribute("title",       "Open the chessmsg Discord invite");
      return;
    }

    if (PREFS.DISCORD_BUTTON_MODE === "widget") {
      btn.addEventListener("click", openDiscordPopup);
      btn.setAttribute("aria-label", "Open the chessmsg Discord widget");
      btn.setAttribute("title",       "Open the chessmsg Discord widget");
      const closeBtn = $("#discord-close");
      if (closeBtn) closeBtn.addEventListener("click", closeDiscordPopup);
      const popup = $("#discord-popup");
      if (popup) {
        popup.addEventListener("click", function (e) {
          if (e.target === popup) closeDiscordPopup();
        });
      }
      document.addEventListener("keydown", function (e) {
        if (!e) return;
        if (e.key !== "Escape") return;
        const p = $("#discord-popup");
        if (p && !p.classList.contains("hidden")) closeDiscordPopup();
      });
      return;
    }

    console.warn("[chessmsg] unknown PREFS.DISCORD_BUTTON_MODE:", PREFS.DISCORD_BUTTON_MODE);
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
  }

  function init() {
    san = parseInitialSan();
    pickedSan = null;
    sourceSq = null;
    baseChess = new Chess();
    if (san.length && !replaySan(baseChess, san)) {
      baseChess = new Chess();
      san = [];
    }
    chess = new Chess(baseChess.fen());
    loadMoveRows();
    $("#share").addEventListener("click", doShare);
    initDiscord();
    rerender();
    window.addEventListener("resize", function () {
      requestAnimationFrame(function () {
        layoutRowBars();
        layoutMinibar();
        const activeRow = rowData ? rowData.find((r) => r.san === pickedSan) : null;
        if (activeRow) drawArrow(activeRow.fromIdx, activeRow.toIdx);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (!e) return;
      if (e.key === "Escape" && isPromotionPopupOpen()) {
        cancelPromotionPopup();
        return;
      }
      if (e.key === "k" || e.key === "K") {
        runKeyTest();
      }
    });
    initStockfish();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
