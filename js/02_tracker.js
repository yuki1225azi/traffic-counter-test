/*
  02_tracker.js : 追跡(Tracking)コア

  【このファイルが担当すること】
  - Trackクラス（1対象の履歴/ロスト/ヒット管理）
  - Trackerクラス（ID付与・マッチング・更新・消滅判定）

  【依存】
  - 検出結果フォーマット（det）
  - distance/IoU等の評価関数（同ファイル内）

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

/* 1つの対象（車/人など）を追跡するための状態クラス */
/* Track：単体の追跡対象。位置履歴から速度/方向を推定し、ロスト管理もする */
class Track {
  constructor(id, det){
    this.id = id;
    this.bbox = det.bbox;
    this.score = det.score;
    this.cls = det.cls;
    this.state = "tentative";
    this.hitStreak = 1; 
    this.lostAge = 0;
    this.createdAt = performance.now();
    this.lastSeenAt = this.createdAt;

    this.prevCenter = this.center(); 
    this.roiVotes = {};     
    this.globalVotes = {};  
    this.totalFramesInRoi = 0;
    this.consecutiveOutsideRoi = 0; 
    this.warpDetected = false;
    this.counted = false;
    
    this.voteGlobal(det.cls, det.score);
  }

  center(){
    const [x,y,w,h] = this.bbox;
    return { x: x + w/2, y: y + h/2 };
  }

  update(det){
    this.prevCenter = this.center(); 
    this.bbox = det.bbox;
    this.score = det.score;
    this.cls = det.cls;
    this.hitStreak++;
    this.lostAge = 0;
    this.lastSeenAt = performance.now();
    
    this.voteGlobal(det.cls, det.score);
  }

  voteRoi(cls, score){
    if(!this.roiVotes[cls]) this.roiVotes[cls] = 0;
    this.roiVotes[cls] += score;
    this.totalFramesInRoi++;
  }

  voteGlobal(cls, score){
    if(!this.globalVotes[cls]) this.globalVotes[cls] = 0;
    this.globalVotes[cls] += score;
  }

  getWinnerClass(){
    const candidates = new Set([...Object.keys(this.roiVotes), ...Object.keys(this.globalVotes)]);
    let bestCls = this.cls;
    let maxScore = -1;

    for(const c of candidates){
      const rScore = this.roiVotes[c] || 0;
      const gScore = this.globalVotes[c] || 0;
      const total = rScore + (gScore * 0.1);
      
      if(total > maxScore){
        maxScore = total;
        bestCls = c;
      }
    }
    return bestCls;
  }
}

// トラッカー管理
class Tracker {
  constructor(opts){
    this.tracks = [];
    this.nextId = 1;
    this.iouThreshold = opts.iouThreshold ?? 0.4;
    this.minHits = 1; 
    this.maxLostAge = opts.maxLostAge ?? 30;
    this.onConfirmed = opts.onConfirmed ?? (()=>{});
    this.onRemoved   = opts.onRemoved   ?? (()=>{});
  }

  static iou(a, b){
    const [x1,y1,w1,h1] = a;
    const [x2,y2,w2,h2] = b;
    const left = Math.max(x1, x2);
    const top  = Math.max(y1, y2);
    const right = Math.min(x1 + w1, x2 + w2);
    const bottom= Math.min(y1 + h1, y2 + h2);
    const iw = Math.max(0, right - left);
    const ih = Math.max(0, bottom - top);
    const inter = iw * ih;
    const union = (w1*h1) + (w2*h2) - inter;
    return union > 0 ? inter/union : 0;
  }

  updateWithDetections(dets) {
    const matches = [];
    const unmatchedDets = new Set(dets.map((_, i) => i));
    const unmatchedTracks = new Set(this.tracks.map((_, i) => i));

    const iouPairs = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      for (let di = 0; di < dets.length; di++) {
        const score = Tracker.iou(this.tracks[ti].bbox, dets[di].bbox);
        if (score >= this.iouThreshold) {
          iouPairs.push({ ti, di, score });
        }
      }
    }
    iouPairs.sort((a, b) => b.score - a.score);
    for (const p of iouPairs) {
      if (unmatchedTracks.has(p.ti) && unmatchedDets.has(p.di)) {
        matches.push(p);
        unmatchedTracks.delete(p.ti);
        unmatchedDets.delete(p.di);
      }
    }

    const distPairs = [];
    const MAX_DIST_REL = 0.2; 

    const W = DOM.canvas.width || 1;
    const H = DOM.canvas.height || 1;
    const norm = Math.sqrt(W * W + H * H); 

    for (const ti of unmatchedTracks) {
      const tr = this.tracks[ti];
      const c1 = tr.center();
      
      for (const di of unmatchedDets) {
        const d = dets[di];
        const cx = d.bbox[0] + d.bbox[2] / 2;
        const cy = d.bbox[1] + d.bbox[3] / 2;
        
        const dist = Math.sqrt((c1.x - cx) ** 2 + (c1.y - cy) ** 2);
        const relDist = dist / norm;

        if (relDist < MAX_DIST_REL) {
          distPairs.push({ ti, di, score: 1.0 - relDist });
        }
      }
    }

    distPairs.sort((a, b) => b.score - a.score);
    for (const p of distPairs) {
      if (unmatchedTracks.has(p.ti) && unmatchedDets.has(p.di)) {
        matches.push(p);
        unmatchedTracks.delete(p.ti);
        unmatchedDets.delete(p.di);
      }
    }

    for (const m of matches) {
      const tr = this.tracks[m.ti];
      const det = dets[m.di];
      tr.update(det);
      if (tr.state === "tentative" && tr.hitStreak >= this.minHits) {
        tr.state = "confirmed";
        this.onConfirmed(tr);
      }
    }

    for (const di of unmatchedDets) {
      const det = dets[di];
      const tr = new Track(this.nextId++, det);
      this.tracks.push(tr);
    }

    for (const ti of unmatchedTracks) {
      this.tracks[ti].lostAge++;
    }

    const kept = [];
    for (const tr of this.tracks) {
      if (tr.lostAge <= this.maxLostAge) {
        kept.push(tr);
      } else {
        this.onRemoved(tr);
      }
    }
    this.tracks = kept;
  }
}

let tracker = null;

// カウント・ログ記録処理
function isVehicleClass(cls){
  return VEHICLE_CATS.includes(cls);
}

function recordEvent() {
  const now = new Date();
  const snapshot = { ...countsCurrentHour };
  
  const row = {
    timestamp: formatTimestamp(now),
    ...snapshot,
    total_counted_mode: getCountedTotalByMode(snapshot)
  };

  recordsHourly.push(row);
  updateLogDisplay(); 
}

function countUp(cls){
  if(!UI_CATS.includes(cls)) return;
  countsCurrentHour[cls] += 1;
  updateCountUI();
  updateHourTitle();
  
  recordEvent();
}

