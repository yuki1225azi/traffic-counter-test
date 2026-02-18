/*
  04_app_init.js : 起動処理(Init)の核

  【このファイルが担当すること】
  - window load → init() 起動
  - 起動時のUI初期化/各機能のセットアップ呼び出し
  - 開始停止の大枠フロー（アプリ状態の初期化）

  【依存】
  - 00〜03で定義された関数/変数
  - DOM（00）

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

// アプリケーション初期化
window.addEventListener("load", init);

/* 起動時に一度だけ走る初期化処理（UI準備→モデル準備→ループ開始の入口） */
/* init：起動の入口。UI準備→既存データ復元→カメラ/モデル準備→描画ループ開始の順で進む */
async function init(){
  try{
    removeSettingsInfoMark();    
    setupTitleDescription();     
    injectModeInactiveStyle();   

    applyModeUiState();
    setupSettingItemHelpPopups();
    
    tf.env().set('WEBGL_PACK', false);
    tf.env().set('WEBGL_CONV_IM2COL', false);

    progressFake(5);
    
    await tf.ready();

    if(tf.getBackend() !== 'webgl'){
       try{ await tf.setBackend('webgl'); }catch(e){ console.warn(e); }
    }

    progressFake(35);
    
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

    progressFake(100);
    setTimeout(()=>DOM.status.classList.add("hidden"), 500);

    await setupCamera();

    await getGeolocation().catch(err=>{
      console.warn("Initial geolocation failed:", err?.message || err);
      toast("位置情報の自動取得に失敗しました", true);
    });

    setupEventListeners();
    setupTracker();
    updateHourTitle();
    updateLogTableVisibility();
    mainRenderLoop();

    DOM.toggleBtn.disabled = false;
    
  }catch(err){
    console.error(err);
    const errStr = String(err?.message || err || "");
    let userMsg = `${errStr}`;

    if(errStr.includes("Permission denied") || errStr.includes("NotAllowedError")){
      userMsg = "カメラの利用が許可されていません。";
    } else if(errStr.includes("device") || errStr.includes("found")){
      userMsg = "カメラが見つかりません。";
    } else if(errStr.includes("WebGL")){
      userMsg = "AIの起動に失敗しました(WebGLエラー)";
    }

    toast(userMsg, true);
    
    const loadingText = document.getElementById("loading-model");
    if(loadingText) loadingText.textContent = "起動エラー";
  }
}

// イベントリスナー設定
