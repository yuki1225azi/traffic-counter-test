/*
  03_count_logic.js : カウント判定ロジック

  【このファイルが担当すること】
  - モード別カウント判定(applyCountByMode)
  - イベント記録(recordEvent)と加算(countUp)
  - 確定トラックのROIカウント更新/除外処理

  【依存】
  - Trackerで管理されたトラック情報
  - ROI/幾何計算（01）
  - UI更新(DOM.count 等)

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

/* 現在のカウント方式（モード）に応じてカウント判定を適用 */
/* ここが“カウントの心臓部”。ROI内/ライン交差などモード別に判定し、イベントを1回だけ記録する */
function applyCountByMode(cls){
  if(countMode === "pedestrian"){
    if(cls === "person") countUp("person");
    return;
  }
  if(isVehicleClass(cls)) countUp(cls);
}

// ROI内判定・カウントロジック
function updateRoiCountingForConfirmedTracks(){
  const r_orig = getRoiPx(); 
  const factor = DOM.hitArea ? (1.0 - Number(DOM.hitArea.value)) : 1.0; 

  const centroid = r_orig.reduce((a, b) => ({x: a.x + b.x/4, y: a.y + b.y/4}), {x:0, y:0});
  
  const r = r_orig.map(p => ({
    x: centroid.x + (p.x - centroid.x) * factor,
    y: centroid.y + (p.y - centroid.y) * factor
  }));

  for(const tr of tracker.tracks){
    if(tr.state !== "confirmed" || tr.counted) continue;
    if(tr.lostAge > 0) continue;

    const c = tr.center();
    const prev = tr.prevCenter;

    let isMoving = true;
    if(prev){
       const dist = Math.sqrt((c.x - prev.x)**2 + (c.y - prev.y)**2);
       if(dist < 2.0) isMoving = false; 
    }

    let inRoi = isPointInPolygon(c, r);
    
    if(inRoi && !isMoving) continue;

    let isWarp = false;
    if(!inRoi && prev){
      isWarp = isLineIntersectingPolygon(prev, c, r);
    }

    if(inRoi || isWarp){
      tr.voteRoi(tr.cls, tr.score); 
      if(isWarp) tr.warpDetected = true;
      tr.consecutiveOutsideRoi = 0;
    } else {
      tr.consecutiveOutsideRoi++;
      if(tr.consecutiveOutsideRoi >= 2){
         if(tr.totalFramesInRoi >= 2 || tr.warpDetected){
            const winner = tr.getWinnerClass();
            applyCountByMode(winner);
            tr.counted = true;
         }
      }
    }
  }
}
function onTrackRemoved(tr){
  if(!tr.counted){
    if(tr.totalFramesInRoi >= 2 || tr.warpDetected){
      const winner = tr.getWinnerClass();
      applyCountByMode(winner);
      tr.counted = true;
    }
  }
}

function filterDetectionsByMode(rawDets){
  if(countMode === "pedestrian"){
    return rawDets.filter(d => d.cls === "person");
  }

  const vehicles = rawDets.filter(d => VEHICLE_CATS.includes(d.cls));
  return vehicles;
}

function progressFake(percent){
  if(DOM.loadingProg) DOM.loadingProg.value = percent;
  if(DOM.loadingPerc) DOM.loadingPerc.textContent = percent + "%";
}

