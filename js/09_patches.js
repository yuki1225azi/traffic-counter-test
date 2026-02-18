/*
  09_patches.js : パッチ/補助機能

  【このファイルが担当すること】
  - ROIロック等の補助挙動を“後付け”で適用
  - 既存ロジックに手を入れずに振る舞いを補強

  【依存】
  - DOM/各機能の関数が定義済みであること

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

(/* 計測開始後のROI変更を抑止（現場誤操作の防止） */
function lockRoiAfterStartPatch(){
  try{
    const _startAnalysis = startAnalysis;
    startAnalysis = function(){
      window.roiLocked = true;
      return _startAnalysis.apply(this, arguments);
    };

    const _stopAnalysis = stopAnalysis;
    stopAnalysis = function(){
      const r = _stopAnalysis.apply(this, arguments);
      window.roiLocked = false;
      return r;
    };

    const c = DOM.canvas;
    if(!c) return;

    const blockIfLocked = (ev)=>{
      if(DOM.videoContainer && DOM.videoContainer.classList.contains("is-floating")){
        return; 
      }

      if(isAnalyzing && window.roiLocked === true){
        
        const rect = c.getBoundingClientRect();
        const scale = (c.width || 1) / rect.width; 
        
        const mx = (ev.clientX - rect.left) * scale;
        const my = (ev.clientY - rect.top) * scale;
        
        const pts = getRoiPx(); 
        let isHit = false;
        
        const hitRadius = 40 * scale; 

        for(const p of pts){
           const dist = Math.sqrt((mx - p.x)**2 + (my - p.y)**2);
           if(dist < hitRadius){
             isHit = true;
             break;
           }
        }

        if(isHit){
           ev.preventDefault();
           ev.stopImmediatePropagation();
           
           if(ev.type === "pointerdown"){
             toast("測定中は測定枠を変更できません");
           }
        }
      }
    };

    c.addEventListener("pointerdown", blockIfLocked, true);
    c.addEventListener("pointermove", blockIfLocked, true);
    c.addEventListener("pointerup",   blockIfLocked, true);
    
    window.roiLocked = false;

  }catch(e){
    console.warn("ROI lock patch failed:", e);
  }
})();

// 設定無効化機能
(function disableSettingsWhileRunningPatch(){
  try{
    const SETTINGS_IDS = [
      "count-mode",
      "hit-area", 
      "score-th",
      "max-lost",
      "max-fps",
      "auto-start-dt",
      "auto-end-dt",
      "reserve-btn",
    ];

    const getEls = ()=> SETTINGS_IDS
      .map(id=>document.getElementById(id))
      .filter(Boolean);

    if(!document.getElementById("disable-settings-style")){ /* style moved to style.css */ }

    function setLocked(locked){
      const els = getEls();
      els.forEach(el=>{
        if("disabled" in el) el.disabled = !!locked;
      });

      const grid = document.querySelector("#settings-panel .settings-grid");
      if(grid) grid.classList.toggle("is-locked", !!locked);
    }

    const _start = startAnalysis;
    startAnalysis = function(){
      setLocked(true);
      return _start.apply(this, arguments);
    };

    const _stop = stopAnalysis;
    stopAnalysis = function(){
      const r = _stop.apply(this, arguments);
      setLocked(false);
      return r;
    };

    setLocked(false);
  }catch(e){
    console.warn("Disable settings patch failed:", e);
  }
})();

// スリープ抑止機能
(function wakeLockPatch(){
  let wakeLock = null;

  async function requestWakeLock(){
    try{
      if(!("wakeLock" in navigator) || !navigator.wakeLock?.request){
        return false;
      }
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", ()=>{
        wakeLock = null;
      });
      return true;
    }catch(e){
      console.warn("WakeLock request failed:", e);
      wakeLock = null;
      return false;
    }
  }

  async function releaseWakeLock(){
    try{
      if(wakeLock){
        await wakeLock.release();
        wakeLock = null;
      }
    }catch(e){
      console.warn("WakeLock release failed:", e);
    }
  }

  document.addEventListener("visibilitychange", async ()=>{
    if(document.visibilityState === "visible" && (isAnalyzing === true)){
      await requestWakeLock();
    }
  });

  const _start = startAnalysis;
  startAnalysis = function(){
    requestWakeLock().then(ok=>{
      if(!ok) toast("スリープ抑止が非対応の端末です");
    });
    return _start.apply(this, arguments);
  };

  const _stop = stopAnalysis;
  stopAnalysis = function(){
    releaseWakeLock();
    return _stop.apply(this, arguments);
  };
})();

// データバックアップ・復旧機能
