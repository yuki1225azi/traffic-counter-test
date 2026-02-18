/*
  06_scheduler_camera_geo.js : 予約計測・カメラ・位置情報

  【このファイルが担当すること】
  - 予約計測（開始/終了日時→自動開始/停止）
  - カメラ/入力ソース初期化
  - 位置情報(緯度経度)取得

  【依存】
  - ブラウザAPI(getUserMedia / Geolocation)
  - DOM入力欄

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

/* 予約計測：指定時刻になったら自動で開始/停止 */
/* 予約計測：開始/終了の日時に達したら自動で start/stop を呼ぶ（人手を減らす） */
function applySchedule(){
  if(scheduleTimerStart) clearTimeout(scheduleTimerStart);
  if(scheduleTimerEnd) clearTimeout(scheduleTimerEnd);

  const start = DOM.startDt.value ? new Date(DOM.startDt.value) : null;
  const end   = DOM.endDt.value ? new Date(DOM.endDt.value) : null;
  const now = new Date();

  let scheduled = false;

  if(start && start > now){
    scheduleTimerStart = setTimeout(()=>{ if(!isAnalyzing) toggleAnalysis(); }, start - now);
    scheduled = true;
  }

  if(end && (!start || end > start)){
    scheduleTimerEnd = setTimeout(()=>{ if(isAnalyzing) toggleAnalysis(); }, Math.max(0, end - now));
    scheduled = true;
  }

  if(scheduled) toast("予約が完了しました");
  else toast("予約可能な日時が設定されていません", true);
}

// 位置情報取得
function getGeolocation(){
  return new Promise((resolve, reject)=>{
    if(!navigator.geolocation){
      DOM.geoLat.textContent = "非対応";
      DOM.geoLng.textContent = "非対応";
      reject(new Error("ブラウザが位置情報取得に非対応です"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos=>{
        geo.lat = pos.coords.latitude.toFixed(6);
        geo.lng = pos.coords.longitude.toFixed(6);
        DOM.geoLat.textContent = geo.lat;
        DOM.geoLng.textContent = geo.lng;
        resolve(pos);
      },
      err=>{
        geo.lat = "取得失敗";
        geo.lng = "取得失敗";
        DOM.geoLat.textContent = geo.lat;
        DOM.geoLng.textContent = geo.lng;
        reject(err);
      },
      { enableHighAccuracy:true, timeout:8000, maximumAge:60000 }
    );
  });
}

// カメラ・キャンバス設定
async function setupCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  DOM.video.srcObject = stream;
  return new Promise(resolve=>{
    DOM.video.onloadedmetadata = ()=>{
      DOM.video.play();
      adjustCanvasSize();
      resolve();
    };
  });
}

function adjustCanvasSize(){
  const w = DOM.video.videoWidth;
  const h = DOM.video.videoHeight;
  if(!w || !h) return;

  DOM.canvas.width = w;
  DOM.canvas.height = h;

  if(DOM.videoContainer) {
    DOM.videoContainer.style.aspectRatio = `${w} / ${h}`;
  }
  
  DOM.video.style.objectFit = "contain";
  DOM.canvas.style.objectFit = "contain";

  DOM.canvas.style.width = "100%";
  DOM.canvas.style.height = "100%";

  const infoPanel = document.getElementById("info-panel");
  if (infoPanel) {
    const isPC = window.matchMedia("(min-width: 1024px)").matches;
    
    if (isPC && DOM.videoContainer) {
      const videoBottom = DOM.videoContainer.getBoundingClientRect().bottom;
      
      const panelTop = infoPanel.getBoundingClientRect().top;
      
      const targetHeight = Math.floor(videoBottom - panelTop) - 2;
      
      infoPanel.style.height = `${Math.max(0, targetHeight)}px`;
      
    } else {
      infoPanel.style.height = "";
    }
  }
}


// トラッカー初期化
function setupTracker(){
  tracker = new Tracker({
    iouThreshold: 0.4,
    maxLostAge: Number(DOM.maxLost.value),

    onConfirmed: (tr)=>{
      if(countLogic !== "classic") return;
      applyCountByMode(tr.cls);
    },

    onRemoved: (tr)=> onTrackRemoved(tr),
  });
}

// メインレンダリングループ
