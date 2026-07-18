(function () {
  "use strict";

  const FILES = ["a","b","c","d","e","f","g","h"];

  function pieceImageSrc(cell) {
    const typePart = cell.type.toUpperCase();
    const colorPart = cell.color === "w" ? "w" : "b";
    return "img/pieces/" + colorPart + typePart + ".png";
  }

  let chess, baseChess, san, pickedSan, previewSan, rowData;
  const $ = (s) => document.querySelector(s);

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
    if (baseChess.turn() === "b") return (Number(r) - 1) * 8 + fileIdx;
    return (8 - Number(r)) * 8 + fileIdx;
  }
  function idxToSq(i) {
    const fileIdx = i % 8;
    const rowIdx = Math.floor(i / 8);
    if (baseChess.turn() === "b") return FILES[fileIdx] + (rowIdx + 1);
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
        const cell = rows[rankRow][f];
        const sq = document.createElement("div");
        sq.className = "sq " + (((rankRow + f) % 2 === 0) ? "light" : "dark");
        const uci = flipped
          ? FILES[f] + (r + 1)
          : FILES[f] + (8 - r);
        sq.dataset.uci = uci;
        sq.dataset.idx = (r * 8 + f);
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
    rowData = verbose.map((m) => {
      const fromIdx = cellIndex(m.from[0], m.from[1]);
      const toIdx   = cellIndex(m.to[0],   m.to[1]);
      return {
        san: m.san,
        uci: m.from + m.to + (m.promotion || ""),
        fromIdx,
        toIdx,
        label: null,
      };
    });
  }

  function cpBarWidth(label, turn) {
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
        const pct = cpBarWidth(label, t.turn());
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
    const isLeftClicked = row.san === previewSan;
    const isRightClicked = row.san === pickedSan;
    const el = document.createElement("div");
    let cls = "row";
    if (isLeftClicked) cls += " left-clicked";
    if (isRightClicked) cls += " right-clicked";
    el.className = cls;

    const left = document.createElement("div");
    left.className = "left";
    left.onclick = function () { previewMove(idx); };

    const sanSpan = document.createElement("span");
    sanSpan.className = "san";
    sanSpan.textContent = row.san;
    left.appendChild(sanSpan);

    const scoreSpan = document.createElement("span");
    scoreSpan.className = "score";
    scoreSpan.textContent = fmtScore(row.label, turn);
    left.appendChild(scoreSpan);

    const barWidth = cpBarWidth(row.label, turn);
    const cells = mateCells(row.label, turn);

    if (barWidth !== null) {
      const bar = document.createElement("span");
      bar.className = "score-bar";
      const fill = document.createElement("span");
      fill.className = "score-bar-fill";
      fill.style.width = barWidth.toFixed(2) + "%";
      bar.appendChild(fill);
      left.appendChild(bar);
    } else if (cells) {
      const wrap = document.createElement("span");
      wrap.className = "score-cells " + cells.sign;
      for (let i = 0; i < cells.count; i++) {
        const cell = document.createElement("span");
        cell.className = "score-cell";
        wrap.appendChild(cell);
      }
      left.appendChild(wrap);
    }

    const right = document.createElement("div");
    right.className = "right";
    right.onclick = function () { commitMove(idx); };

    el.appendChild(left);
    el.appendChild(right);
    return el;
  }

  function renderMoveList() {
    const list = $("#moves");
    list.innerHTML = "";
    rowData.forEach((row, idx) => list.appendChild(makeRow(idx, row)));
    layoutRowBars();
  }

  function layoutRowBars() {
    const rows = Array.from(document.querySelectorAll("#moves .row"));
    if (!rows.length) return;
    let maxTextBlockWidth = 0;
    for (const rowEl of rows) {
      const sanEl = rowEl.querySelector(".san");
      const scoreEl = rowEl.querySelector(".score");
      if (!sanEl || !scoreEl) continue;
      const tw = sanEl.offsetWidth + scoreEl.offsetWidth;
      if (tw > maxTextBlockWidth) maxTextBlockWidth = tw;
    }
    for (const rowEl of rows) {
      const leftHalf = rowEl.querySelector(".left");
      const scoreEl = rowEl.querySelector(".score");
      const barEl = rowEl.querySelector(".score-bar");
      if (!leftHalf || !barEl) continue;
      const cs = getComputedStyle(leftHalf);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const leftInner = leftHalf.clientWidth - padL - padR;
      const labelGap = scoreEl ? (parseFloat(getComputedStyle(scoreEl).marginLeft) || 0) : 0;
      const fixedPadding = labelGap;
      const barWidth = Math.max(0, leftInner - maxTextBlockWidth - fixedPadding);
      barEl.style.width = barWidth + "px";
    }
  }

  function rerender() {
    buildBoard();
    renderMoveList();
    const activeSan = previewSan || pickedSan;
    const activeRow = activeSan ? rowData.find((r) => r.san === activeSan) : null;
    if (activeRow) {
      drawArrow(activeRow.fromIdx, activeRow.toIdx);
    } else {
      clearArrows();
    }
    updateShare();
  }

  function updateShare() {
    const btn = $("#share");
    btn.disabled = !pickedSan;
    btn.textContent = "Share";
  }

  function previewMove(idx) {
    const row = rowData[idx];
    if (!row) return;
    if (previewSan === row.san) {
      previewSan = null;
      pickedSan = null;
      chess = new Chess(baseChess.fen());
      rerender();
      return;
    }
    pickedSan = null;
    previewSan = row.san;
    chess = new Chess(baseChess.fen());
    drawArrow(row.fromIdx, row.toIdx);
    rerender();
  }

  function commitMove(idx) {
    const row = rowData[idx];
    if (!row) return;
    if (pickedSan === row.san) {
      pickedSan = null;
      previewSan = null;
      chess = new Chess(baseChess.fen());
      rerender();
      return;
    }
    pickedSan = row.san;
    previewSan = null;
    chess = new Chess(baseChess.fen());
    const from = idxToSq(row.fromIdx);
    const to   = idxToSq(row.toIdx);
    const promotion = /^[a-h][18][a-h][18]$/.test(row.uci)
      ? row.uci.slice(4) || "q"
      : null;
    const res = chess.move({ from: from, to: to, promotion: promotion || "q" });
    if (!res) {
      pickedSan = null;
      rerender();
      return;
    }
    rerender();
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

  function init() {
    san = parseInitialSan();
    pickedSan = null;
    baseChess = new Chess();
    if (san.length && !replaySan(baseChess, san)) {
      baseChess = new Chess();
      san = [];
    }
    chess = new Chess(baseChess.fen());
    loadMoveRows();
    $("#share").addEventListener("click", doShare);
    rerender();
    window.addEventListener("resize", function () {
      requestAnimationFrame(function () {
        layoutRowBars();
        const activeRow = rowData ? rowData.find((r) => r.san === previewSan || r.san === pickedSan) : null;
        if (activeRow) drawArrow(activeRow.fromIdx, activeRow.toIdx);
      });
    });
    document.addEventListener("keydown", function (e) {
      if (!e) return;
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
