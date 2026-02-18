/*
  01_geometry_roi.js : ROI編集と幾何計算

  【このファイルが担当すること】
  - ROI(カウント範囲)の保存/復元・正規化↔px変換
  - ROIドラッグ編集(ハンドル/移動/リサイズ)
  - ROI描画
  - 点inポリゴン/線分交差などの幾何関数

  【依存】
  - DOM.canvas / DOM.ctx（00で初期化）
  - ROI_NORM 等のROI状態（グローバル）

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

/* ROI編集UI：ドラッグ/リサイズ（スマホのポインタ操作対応） */
/* ROI編集：ポインタ操作で移動/リサイズ。スマホの誤スクロール抑止もここで扱う */
function setupRoiDrag(){
  const c = DOM.canvas;
  if(!c) return;

  c.style.touchAction = "pan-y"; 
  let dragging = false;
  let dragIndex = -1;
  let dragCache = null;
  let lockTimer = null;

  const TOUCH_HIT_RADIUS_PX = 40; 
  const MOUSE_HIT_RADIUS_PX = 20;

  const activateScrollLock = () => {
    if(lockTimer) clearTimeout(lockTimer);
    c.style.touchAction = "none"; 
  };

  const scheduleScrollUnlock = (isTouch) => {
    if(lockTimer) clearTimeout(lockTimer);
    const delay = isTouch ? 1000 : 0;
    if (delay > 0) {
      lockTimer = setTimeout(() => {
        c.classList.remove("roi-active");
        c.style.touchAction = "pan-y"; 
        saveRoi();
        lockTimer = null;
      }, delay);
    } else {
      c.classList.remove("roi-active");
      c.style.touchAction = "pan-y";
      saveRoi();
      lockTimer = null;
    }
  };

  const checkHit = (clientX, clientY, isTouch) => {
    const rect = c.getBoundingClientRect();
    const cw = c.width || 1;
    const ch = c.height || 1; 
    const scale = Math.min(rect.width / cw, rect.height / ch); 
    const offsetX = (rect.width - (cw * scale)) / 2;
    const offsetY = (rect.height - (ch * scale)) / 2;
    
    const xIn = (clientX - rect.left - offsetX) / scale;
    const yIn = (clientY - rect.top - offsetY) / scale;
    
    const pts = getRoiPx(); 
    const radius = (isTouch ? TOUCH_HIT_RADIUS_PX : MOUSE_HIT_RADIUS_PX) / scale;

    let closestIdx = -1;
    let minDistance = Infinity;

    pts.forEach((pt, i) => {
      const dist = Math.sqrt((xIn - pt.x)**2 + (yIn - pt.y)**2);
      if(dist <= radius && dist < minDistance){
        minDistance = dist;
        closestIdx = i;
      }
    });
    return { index: closestIdx, rect, scale, offsetX, offsetY };
  };

  const handleFastInterrupt = (e) => {
    if (isAnalyzing || window.roiLocked === true) return;
    
    if (c.classList.contains("roi-active") && e.cancelable) {
      e.preventDefault();
      return;
    }

    const touch = e.touches ? e.touches[0] : e;
    const hit = checkHit(touch.clientX, touch.clientY, !!e.touches);

    if (hit.index !== -1 && e.cancelable) {
      e.preventDefault();
    }
  };

  const startDrag = (ev)=>{
    if(isAnalyzing || window.roiLocked === true) return;
    if(DOM.videoContainer && DOM.videoContainer.classList.contains("is-floating")) return;

    const isTouch = (ev.pointerType === 'touch' || ev.pointerType === 'pen');
    const hit = checkHit(ev.clientX, ev.clientY, isTouch);

    if(hit.index !== -1){
      if(ev.cancelable) ev.preventDefault();
      
      dragging = true;
      dragIndex = hit.index;
      dragCache = { 
        rect: hit.rect, scale: hit.scale, 
        offsetX: hit.offsetX, offsetY: hit.offsetY,
        cw: c.width, ch: c.height 
      };
      
      c.classList.add("roi-active"); 
      activateScrollLock(); 
      ev.stopImmediatePropagation();
      try{ c.setPointerCapture(ev.pointerId); }catch(_e){}
    }
  };

  const moveDrag = (ev)=>{
    if(!dragging || dragIndex === -1 || !dragCache) return;
    if(ev.cancelable) ev.preventDefault();
    ev.stopImmediatePropagation();

    const { rect, scale, offsetX, offsetY, cw, ch } = dragCache;
    const xClamped = Math.max(0, Math.min(cw * scale, ev.clientX - rect.left - offsetX));
    const yClamped = Math.max(0, Math.min(ch * scale, ev.clientY - rect.top - offsetY));

    ROI_NORM[dragIndex] = {
      x: Math.max(0, Math.min(1, (xClamped / scale) / cw)),
      y: Math.max(0, Math.min(1, (yClamped / scale) / ch))
    };
  };

  const endDrag = (ev)=>{
    if(!dragging) return;
    dragging = false;
    dragIndex = -1;
    dragCache = null;
    const isTouch = (ev.pointerType === 'touch' || ev.pointerType === 'pen');
    try{ c.releasePointerCapture(ev.pointerId); }catch(_e){}
    scheduleScrollUnlock(isTouch);
  };

  c.addEventListener("touchstart", handleFastInterrupt, { passive: false });
  c.addEventListener("pointerdown", startDrag, { passive: false });
  c.addEventListener("pointermove", moveDrag, { passive: false });
  c.addEventListener("pointerup", endDrag);
  c.addEventListener("pointercancel", endDrag);
}

// ROI描画処理
function drawRoi(ctx){
  const pts = getRoiPx(); 
  if(pts.length < 4) return;

  const isActive = DOM.canvas.classList.contains("roi-active");
  const mainColor = isActive ? "#ff9800" : "#ffffff"; 

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1; i<4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();

  ctx.fillStyle = isActive ? "rgba(255, 152, 0, 0.2)" : "rgba(255, 255, 255, 0.15)";
  ctx.fill();

  ctx.lineWidth = isActive ? 4 : 2;
  ctx.strokeStyle = mainColor;
  if (!isActive) ctx.setLineDash([5, 5]); 
  ctx.stroke();

  ctx.setLineDash([]);
  pts.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = mainColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

// 幾何計算ユーティリティ
function isPointInPolygon(p, polygon) {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
                      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

/* 線分がポリゴン境界と交差するか（カウント判定用） */
function isLineIntersectingPolygon(p1, p2, polygon) {
  for (let i = 0; i < polygon.length; i++) {
    const s1 = polygon[i];
    const s2 = polygon[(i + 1) % polygon.length]; 
    if (getLineIntersection(p1, p2, s1, s2)) return true;
  }
  return false;
}

function getLineIntersection(p0, p1, p2, p3) {
  let s1_x = p1.x - p0.x;     let s1_y = p1.y - p0.y;
  let s2_x = p3.x - p2.x;     let s2_y = p3.y - p2.y;
  let s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
  let t = ( s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);
  return (s >= 0 && s <= 1 && t >= 0 && t <= 1);
}

// 物体追跡クラス
