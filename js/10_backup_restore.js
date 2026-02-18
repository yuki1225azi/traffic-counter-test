/*
  10_backup_restore.js : localStorageバックアップ/復元

  【このファイルが担当すること】
  - 自動バックアップ(saveBackup)
  - 復元(loadBackup)・クラッシュ対策

  【依存】
  - localStorage
  - ログ配列/カウント値/状態（グローバル）

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

(function crashProtectionPatch() {
  const BACKUP_KEY = "trafficCounter_crash_backup_v1";
  let isResumed = false; 
  let backupInterval = null;

  let saveDebounceTimer = null; 

  const _updateCountUI = updateCountUI;
  updateCountUI = function() {
    _updateCountUI.apply(this, arguments);
    try {
      
      if(saveDebounceTimer) clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(saveBackup, 1000); 

    } catch(e) {}
  };

  window.addEventListener("pagehide", () => {
    if(saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveBackup();
  });

  /* localStorageへ自動バックアップ（クラッシュ/誤閉じ対策） */
/* 自動バックアップ：クラッシュ/タブ誤閉じでも直前まで復元できるよう、localStorageへ退避 */
function saveBackup() {
    if (!isAnalyzing && !isResumed) return;

    try {
      const data = {
        savedAt: Date.now(),
        countsCurrentHour,
        recordsHourly,
        analysisStartTime: analysisStartTime ? analysisStartTime.getTime() : null,
        hourWindowStart: hourWindowStart ? hourWindowStart.getTime() : null,
        countMode
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Backup failed:", e);
    }
  }

  /* 起動時にバックアップがあれば復元して再開できるようにする */
function loadBackup() {
    try {
      const json = localStorage.getItem(BACKUP_KEY);
      if (!json) return false;

      const data = JSON.parse(json);
      
      countsCurrentHour = data.countsCurrentHour || zeroCounts();
      recordsHourly = data.recordsHourly || [];
      
      if (data.analysisStartTime) analysisStartTime = new Date(data.analysisStartTime);
      if (data.hourWindowStart) hourWindowStart = new Date(data.hourWindowStart);

      if (data.countMode) {
        countMode = data.countMode;
        if(DOM.countModeSelect) DOM.countModeSelect.value = normalizeMode(countMode);
        try{ applyModeUiState(); }catch(e){}
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearBackup() {
    try { localStorage.removeItem(BACKUP_KEY); } catch(e) {}
  }

  if (loadBackup()) {
    isResumed = true;
    window.addEventListener("load", () => {
       updateCountUI(); 
       rebuildLogTable(); 
       toast("前回のデータを復元しました。\n「開始」で測定を再開します。", true);

       const modeSel = document.getElementById("count-mode");
       if(modeSel) modeSel.disabled = true;
    });
  }

  const _start = startAnalysis;
  startAnalysis = function() {
    if (isResumed) {
      const savedData = {
        c: countsCurrentHour,
        rh: recordsHourly,
        as: analysisStartTime,
        hw: hourWindowStart
      };

      const ret = _start.apply(this, arguments);

      countsCurrentHour = savedData.c;
      recordsHourly = savedData.rh;
      analysisStartTime = savedData.as;
      hourWindowStart = savedData.hw;

      isResumed = false;
      updateCountUI(); 
      rebuildLogTable(); 
      
      updateHourTitle(); 

      toast("中断箇所から測定を再開しました");
      saveBackup();
      startBackupLoop();
      return ret;

    } else {
      const ret = _start.apply(this, arguments);
      saveBackup(); 
      startBackupLoop();
      return ret;
    }
  };

  const _stop = stopAnalysis;
  stopAnalysis = function() {
    stopBackupLoop();
    clearBackup(); 
    return _stop.apply(this, arguments);
  };

  const _exportCSV = exportCSV;
  exportCSV = async function() {
    try {
      await _exportCSV.apply(this, arguments);
      
      clearBackup(); 
    } catch (e) {
      console.error("CSV出力エラー:", e);
      toast("出力に失敗したため、データを保持します", true);
    }
  };

  function startBackupLoop() {
    if (backupInterval) clearInterval(backupInterval);
    backupInterval = setInterval(saveBackup, 60000); 
  }

  function stopBackupLoop() {
    if (backupInterval) { clearInterval(backupInterval); backupInterval = null; }
  }

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') saveBackup();
  });
  window.addEventListener("pagehide", saveBackup);
  window.addEventListener("beforeunload", saveBackup);

})();

// フローティングプレーヤー機能
(function floatingPlayerPatch(){
  const container = document.getElementById("video-container");
  if(!container) return;

  const closeBtn = document.getElementById("close-float-btn"); 
  let isClosedManually = false;

  if(closeBtn){
    closeBtn.style.pointerEvents = "auto";

    closeBtn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      disableFloating();
      isClosedManually = true;
    });
    
    closeBtn.addEventListener("pointerdown", (e)=> e.stopPropagation());
  }

  function disableFloating(){
    container.classList.remove("is-floating");
    
    const ph = document.getElementById("video-placeholder");
    if(ph) ph.style.display = "none";
    
    container.style.transform = "";
    container.style.left = "";
    container.style.top = "";
    container.style.bottom = "";
    container.style.right = "";
    container.style.width = "";
    container.style.height = "";
  }

  let placeholder = document.getElementById("video-placeholder");
  if(!placeholder){
    placeholder = document.createElement("div");
    placeholder.id = "video-placeholder";
    placeholder.style.display = "none";
    placeholder.style.width = "100%";
    container.parentNode.insertBefore(placeholder, container);
  }

  let sentinel = document.getElementById("video-sentinel");
  if(!sentinel){
    sentinel = document.createElement("div");
    sentinel.id = "video-sentinel";
    sentinel.style.height = "1px";
    sentinel.style.width = "100%";
    sentinel.style.marginTop = "-1px";
    sentinel.style.visibility = "hidden";
    sentinel.style.pointerEvents = "none";
    container.parentNode.insertBefore(sentinel, container.nextSibling);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(container.offsetHeight > 0 && !container.classList.contains("is-floating")){
         placeholder.style.height = container.offsetHeight + "px";
      }

      if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
        if (!isClosedManually && !container.classList.contains("is-floating")) {
          placeholder.style.display = "block"; 
          container.classList.add("is-floating");
          container.style.bottom = "20px";
          container.style.right = "20px";
          container.style.width = "45vw"; 
        }
      } else {
        isClosedManually = false;
        if (container.classList.contains("is-floating")) {
          disableFloating();
        }
      }
    });
  }, { threshold: 0 });

  observer.observe(sentinel);

  let isDragging = false;
  let startX, startY, startLeft, startTop;

  container.addEventListener("pointerdown", (e) => {
    if (!container.classList.contains("is-floating")) return;
    if (e.target === closeBtn || closeBtn.contains(e.target)) return;

    e.preventDefault(); 
    e.stopPropagation();

    isDragging = true;
    
    startX = e.clientX;
    startY = e.clientY;

    const rect = container.getBoundingClientRect();
    
    container.style.bottom = "auto";
    container.style.right = "auto";
    container.style.left = rect.left + "px";
    container.style.top = rect.top + "px";
    container.style.width = rect.width + "px"; 

    startLeft = rect.left;
    startTop = rect.top;
    
    try{ container.setPointerCapture(e.pointerId); }catch(_){}
  });

  container.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    e.preventDefault(); 

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    container.style.left = `${startLeft + dx}px`;
    container.style.top = `${startTop + dy}px`;
  });

  const stopDrag = (e) => {
    if(!isDragging) return;
    isDragging = false;
    try{ container.releasePointerCapture(e.pointerId); }catch(_){}
  };

  container.addEventListener("pointerup", stopDrag);
  container.addEventListener("pointercancel", stopDrag);

})();