/*
  05_ui_settings_bind.js : UIイベント/設定バインド

  【このファイルが担当すること】
  - 設定UI(スライダー/セレクト等)のイベント登録
  - タブ切り替え/ボタン押下などのUI操作の配線

  【依存】
  - DOM（00）
  - init（04）から呼ばれるセットアップ関数

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

/* ボタン/入力欄など、ユーザー操作に対するイベントをまとめて登録 */
/* UIの配線：ボタン・スライダー・セレクトの変更を、内部状態へ反映する */
function setupEventListeners(){
  DOM.toggleBtn.addEventListener("click", toggleAnalysis);

  if(DOM.countModeSelect){
    DOM.countModeSelect.value = normalizeMode(countMode);

    DOM.countModeSelect.addEventListener("change", ()=>{
      countMode = normalizeMode(DOM.countModeSelect.value);
      try{ localStorage.setItem(LS_KEY_MODE, countMode); }catch(_e){}
      applyModeUiState();
      updateCountUI();
      updateHourTitle();
      setupSettingItemHelpPopups();
      updateLogTableVisibility();

      if(isAnalyzing) setupTracker();
    });
  }

  DOM.reserveBtn.addEventListener("click", handleReservation);
  
  const resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => adjustCanvasSize());
  });
  if(DOM.videoContainer) resizeObserver.observe(DOM.videoContainer);

  ["max-lost","score-th","max-fps"].forEach(id=>{
    document.getElementById(id).addEventListener("change", ()=>{
      if(isAnalyzing) setupTracker();
    });
  });

  setupTabs();
  setupRoiDrag(); 
}


/* タブ表示の切り替え（UIの見た目は変えず、表示/非表示のみ制御） */
function setupTabs(){
  const tabs = document.querySelectorAll(".tab-link");
  const contents = document.querySelectorAll(".tab-content");
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.tab;
      tabs.forEach(t=>t.classList.remove("active"));
      contents.forEach(c=>c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${key}`).classList.add("active");
    });
  });
}

// 測定開始・停止制御
function toggleAnalysis(){
  isAnalyzing = !isAnalyzing;
  if(isAnalyzing) startAnalysis();
  else stopAnalysis();
}

function startAnalysis(){
  DOM.toggleBtn.textContent = "終了";
  DOM.toggleBtn.classList.replace("btn-green", "btn-red");
  DOM.canvas.classList.add("analyzing");

  setupTracker();
 
  countsCurrentHour = zeroCounts();
  recordsHourly = [];

  analysisStartTime = new Date();
  hourWindowStart = new Date();

  updateCountUI();
  updateHourTitle();
  updateLogDisplay(true);

  recordEvent();            

  lastInferTime = 0;
}

function stopAnalysis(){
  DOM.toggleBtn.textContent = "開始";
  DOM.toggleBtn.classList.replace("btn-red", "btn-green");
  DOM.canvas.classList.remove("analyzing");

  if(recordsHourly.length > 0){
    exportCSV(recordsHourly, geo); 
  }

  countsCurrentHour = zeroCounts();
  recordsHourly = [];
  
  analysisStartTime = null; 
  hourWindowStart = null;

  updateCountUI();
  updateHourTitle(); 
  updateLogDisplay(true);
  mainRenderLoop();
}

// 予約測定機能
async function handleReservation(){
  try{
    await getGeolocation();
    applySchedule();
  }catch(e){
    toast("位置情報取得が必要です", true);
  }
}

