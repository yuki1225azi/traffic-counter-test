/*
  07_render_loop.js : 描画ループ

  【このファイルが担当すること】
  - 動画→canvas描画
  - バウンディングボックス/ROI等のオーバーレイ描画
  - 描画ループ(mainRenderLoop)

  【依存】
  - DOM.video / DOM.canvas / DOM.ctx
  - 検出・追跡結果（グローバル状態）

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

/* 描画ループ：1フレームごとに描画→推論→表示更新を回す */
/* 描画ループ：描画→推論→追跡→カウント→表示更新 を繰り返す。FPS制限もここで効く */
function mainRenderLoop() {
  const ctx = DOM.ctx;

  ctx.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);

  if (isAnalyzing) {
    const interval = 1000 / Number(DOM.maxFps.value);
    const now = performance.now();

    if (!isModelBusy && (now - lastInferTime >= interval)) {
      lastInferTime = now;
      isModelBusy = true; 

      model.detect(DOM.video).then(preds => {
        const scoreTh = Number(DOM.scoreTh.value);
        const raw = preds.filter(p => UI_CATS.includes(p.class) && p.score >= scoreTh)
                         .map(p => ({ bbox: p.bbox, score: p.score, cls: p.class }));
        
        const dets = filterDetectionsByMode(raw);
        tracker.updateWithDetections(dets);
        updateRoiCountingForConfirmedTracks(); 
      })
      .finally(() => {
         isModelBusy = false; 
      });
    }
    drawAllOverlays(ctx); 
  }

  drawRoi(ctx);

  requestAnimationFrame(mainRenderLoop);
}

// 検出枠描画
function drawAllOverlays(ctx) {
  ctx.save();
  ctx.font = "14px Segoe UI, Arial";
  ctx.lineWidth = 2;
  const color = { car:"#1e88e5", bus:"#43a047", truck:"#fb8c00", motorcycle:"#8e24aa", bicycle:"#fdd835", person:"#e53935" };

  for(const tr of tracker.tracks){
    if(tr.state !== "confirmed") continue;

    const [x,y,w,h] = tr.bbox;
    const cls = tr.cls;

    if(countMode === "vehicle" && cls === "person") continue;
    if(countMode === "pedestrian" && cls !== "person") continue;

    const c = color[cls] || "#fff";

    if (tr.lostAge > 0) {
      ctx.globalAlpha = 0.5;
    } else {
      ctx.globalAlpha = 1.0;
    }

    ctx.strokeStyle = c;
    ctx.strokeRect(x,y,w,h);
    
    const label = `${cls} ${Math.floor(tr.score*100)}%`; 

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x, Math.max(0, y-18), ctx.measureText(label).width + 6, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x+3, Math.max(10, y-4));
    
    ctx.globalAlpha = 1.0;
  }
  ctx.restore();
}

// ログテーブル表示制御
function updateLogTableVisibility() {
  const table = document.getElementById("log-table");
  if (!table) return;

  table.classList.remove("is-loading");

  const ths = table.querySelectorAll("thead th");
  
  if (countMode === "pedestrian") {
    for (let i = 1; i <= 5; i++) ths[i].style.display = "none";
    ths[6].style.display = "table-cell";
  } else {
    for (let i = 1; i <= 5; i++) ths[i].style.display = "table-cell";
    ths[6].style.display = "none";
  }

  rebuildLogTable(); 
}

function rebuildLogTable() {
  DOM.logBody.innerHTML = "";
  [...recordsHourly].reverse().forEach(row => {
    insertLogRow(row);
  });
}

function insertLogRow(row, prepend=false){
  const tr = document.createElement("tr");
  
  const timeCell = `<td>${row.timestamp.split(" ")[1]}</td>`;
  let cells = "";

  if(countMode === "pedestrian"){
    cells = timeCell + `<td>${row.person || 0}</td>`;
  } else {
    cells = timeCell + 
      `<td>${row.car || 0}</td>` +
      `<td>${row.bus || 0}</td>` +
      `<td>${row.truck || 0}</td>` +
      `<td>${row.motorcycle || 0}</td>` +
      `<td>${row.bicycle || 0}</td>`;
  }

  tr.innerHTML = cells;

  if(prepend){
    DOM.logBody.prepend(tr);
  } else {
    DOM.logBody.appendChild(tr);
  }
}

function updateLogDisplay(clear=false){
  if(clear){
    DOM.logBody.innerHTML = "";
    return;
  }
  const last = recordsHourly[recordsHourly.length-1];
  if(!last) return;

  insertLogRow(last, true);
  
  while(DOM.logBody.children.length > MAX_LOGS){
    DOM.logBody.lastChild?.remove();
  }
}

function updateHourTitle(){
  if (!analysisStartTime) {
    DOM.hourTitle.textContent = "測定待機中";
    return;
  }

  const d = analysisStartTime;
  const h = String(d.getHours()).padStart(2,"0");
  const m = String(d.getMinutes()).padStart(2,"0");
  const s = String(d.getSeconds()).padStart(2,"0");
  const timeStr = `${h}:${m}:${s}`;

  if(countMode === "pedestrian"){
    DOM.hourTitle.textContent = `${timeStr}~の通行量`;
    return;
  }

  const total = getCountedTotalByMode(countsCurrentHour);
  DOM.hourTitle.textContent = `${timeStr}~の交通量：計${total}台`;
}

function updateCountUI(){
  for(const k of UI_CATS){
    DOM.count[k].textContent = countsCurrentHour[k];
  }
}

// CSVエクスポート
