/*
  00_core_ui.js : UI土台 / 共通ユーティリティ

  【このファイルが担当すること】
  - 定数(UI_CATSなど)・DOM参照(DOM)
  - トースト/進捗表示などの共通UI関数
  - 情報モーダル/タイトル説明/設定ヘルプ(“i”アイコン)
  - モードUI制御(表示/無効化)

  【依存】
  - index.html の DOM 要素(ID/class)
  - style.css（JS注入していたCSSは移植済み）

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

// 定数定義（カテゴリ一覧など：UI表示・CSV・ロジックで共通に使用）
const UI_CATS = ['car','bus','truck','motorcycle','bicycle','person'];
const VEHICLE_CATS = ['car','bus','truck','motorcycle','bicycle'];

// DOM要素の参照（HTML上の各パーツをここでまとめて取得）
const DOM = {
  videoContainer: document.getElementById("video-container"),  // 動画UIの外枠（video+canvasを載せる）
  video: document.getElementById("video"),  // 入力映像（<video>）
  canvas: document.getElementById("canvas"),  // 描画先キャンバス（オーバーレイ含む）
  ctx: document.getElementById("canvas").getContext("2d"),  // canvasの2D描画コンテキスト
  appTitle: document.getElementById("app-title"),  // 画面上部のタイトル表示（#app-title）
  toggleBtn: document.getElementById("toggle-analysis-btn"),  // 開始/停止ボタン（解析のON/OFF）
  status: document.getElementById("status-indicator"),  // ステータス表示（動作中/停止/準備中など）
  loadingPerc: document.getElementById("loading-percentage"),  // ロード進捗％表示
  loadingProg: document.getElementById("loading-progress"),  // ロード進捗バー(<progress>)
  toast: document.getElementById("toast"),  // トースト通知領域（短いメッセージ表示）
  hourTitle: document.getElementById("current-hour-title"),  // 現在の時間帯タイトル表示（CSVの区切り用など）
  count: {  // カテゴリ別カウント表示
    car: document.getElementById("count-car"),  // 車のカウント表示
    bus: document.getElementById("count-bus"),  // バスのカウント表示
    truck: document.getElementById("count-truck"),  // トラックのカウント表示
    motorcycle: document.getElementById("count-motorcycle"),  // バイクのカウント表示
    bicycle: document.getElementById("count-bicycle"),  // 自転車のカウント表示
    person: document.getElementById("count-person"),  // 人のカウント表示
  },
  logBody: document.getElementById("log-body"),  // イベントログの表（tbody）
  startDt: document.getElementById("auto-start-dt"),  // 予約開始日時入力
  endDt: document.getElementById("auto-end-dt"),  // 予約終了日時入力
  reserveBtn: document.getElementById("reserve-btn"),  // 予約ボタン
  scoreTh: document.getElementById("score-th"),  // スコア閾値入力（検出の信頼度）
  hitArea: document.getElementById("hit-area"),  // ヒット判定エリア(%)入力
  maxLost: document.getElementById("max-lost"),  // ロスト許容フレーム数入力
  maxFps: document.getElementById("max-fps"),  // 最大FPS制限入力
  countModeSelect: document.getElementById("count-mode"),  // カウント方式セレクト
  geoLat: document.getElementById("geo-lat"),  // 緯度表示/入力
  geoLng: document.getElementById("geo-lng"),  // 経度表示/入力
};

// 情報モーダル関連（画面上の“説明”を共通UIとして表示する仕組み）
let INFO_MODAL = { overlay:null, title:null, body:null };

/* 情報モーダル（説明表示）を初回のみ生成して使い回す */
function ensureInfoModal(){
  if(INFO_MODAL.overlay) return;

  if(!document.getElementById("info-modal-style")){ /* style moved to style.css */ }

  const overlay = document.createElement("div");
  overlay.className = "info-modal-overlay";
  overlay.setAttribute("role","dialog");
  overlay.setAttribute("aria-modal","true");

  const modal = document.createElement("div");
  modal.className = "info-modal";

  const header = document.createElement("div");
  header.className = "info-modal-header";

  const title = document.createElement("div");
  title.className = "info-modal-title";
  title.textContent = "説明";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "info-modal-close";
  closeBtn.setAttribute("aria-label","閉じる");
  closeBtn.textContent = "×";

  const body = document.createElement("div");
  body.className = "info-modal-body";

  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = ()=>{
    overlay.style.display = "none";
  };

  overlay.addEventListener("pointerdown", (e)=>{
    if(e.target === overlay) close();
  });

  modal.addEventListener("pointerdown", (e)=> e.stopPropagation());

  closeBtn.addEventListener("click", close);

  window.addEventListener("keydown", (e)=>{
    if(e.key === "Escape" && overlay.style.display === "flex") close();
  });

  INFO_MODAL = { overlay, title, body };
}

function showInfoModal(titleText, bodyText){
  ensureInfoModal();
  INFO_MODAL.title.textContent = titleText || "説明";
  INFO_MODAL.body.textContent = bodyText || "";
  INFO_MODAL.overlay.style.display = "flex";
}

// UI状態制御
const COUNT_ITEM_EL = {};
for(const cat of UI_CATS){
  COUNT_ITEM_EL[cat] = document.querySelector(`.count-item.${cat}`);
}

function injectModeInactiveStyle(){
  // style moved to style.css
  if(document.getElementById("mode-inactive-style")) return;
}

function applyModeUiState(){
  const inactiveCats = (countMode === "vehicle") ? ["person"] : VEHICLE_CATS;
  for(const cat of UI_CATS){
    const el = COUNT_ITEM_EL[cat];
    if(!el) continue;
    el.classList.toggle("inactive", inactiveCats.includes(cat));
  }
}

function getCountedTotalByMode(counts){
  if(countMode === "pedestrian"){
    return Number(counts.person || 0);
  }
  return VEHICLE_CATS.reduce((s,k)=>s + Number(counts[k] || 0), 0);
}

// アプリ説明表示
function setupTitleDescription(){
  const title = DOM.appTitle;
  if(!title) return;

  const oldDesc = title.querySelector(".app-desc");
  if(oldDesc) oldDesc.remove();

  if(title.querySelector(".title-info-btn")) return;

  if(!document.getElementById("title-help-style")){ /* style moved to style.css */ }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "title-info-btn";
  btn.textContent = "i";
  btn.setAttribute("aria-label", "利用ガイド");

  const APP_GUIDE_TEXT = `【機能】
AIがカメラ映像から車両5種と歩行者を判別し、交通量をリアルタイムでカウントします。
測定データはアプリ内に蓄積され、「終了」ボタンを押すと、全期間分をまとめたCSVファイルが一括で保存されます。

【使い方の手順】
1. 画面上の枠をドラッグして、測定したい道路に合わせます。
2. 「開始」ボタンを押すと測定が始まります。
   ※開始後は誤操作防止のため、枠の移動や設定変更はロックされます。

【測定中の注意】
・測定が止まってしまうため、画面のスリープ(消灯)や、他のアプリへの切り替えは行わないでください。
・バッテリー消費が激しいため、充電しながらの使用を推奨します。`;

  btn.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    showInfoModal("利用ガイド", APP_GUIDE_TEXT);
  });

  title.appendChild(btn);
}

// 設定項目のヘルプ表示
function setupSettingItemHelpPopups(){
  if(!document.getElementById("setting-help-style")){ /* style moved to style.css */ }

const HELP = {
    "count-mode":
      "測定する対象の種類を選択します。\n・車両：乗用車、バス、トラック、バイク、自転車\n・歩行者：人のみ",
    
    "hit-area": 
      "カウント対象とする、物体中心部の判定幅を設定します。(10~100%)\n・カウント漏れが起きる場合は値を大きくしてください。\n・隣の車線を誤って拾う場合は値を小さくしてください。",
    
    "score-th":
      "AIが物体であると判断する際の自信の度合いです。(10~90%)\n・看板などを誤検知する場合は値を大きくしてください。\n・車両を見逃す場合は値を小さくしてください。",
    
    "max-fps":
      "1秒間に行う画像解析の回数です。(5~30fps)\n・高速な車両を見逃す場合は値を大きくしてください。\n・スマホの発熱や電池消費を抑える場合は値を小さくしてください。",
     
    "max-lost":
      "物体を見失っても追跡を継続する猶予フレーム数です。(5~30frm)\n・遮蔽物で追跡が切れる場合は値を大きくしてください。\n・別の車両を同一と誤認してしまう場合は値を小さくしてください。",
};

  const grid = document.querySelector("#settings-panel .settings-grid");
  if(!grid) return;

  if(grid.dataset.helpInjected === "1") return;
  grid.dataset.helpInjected = "1";

  const labels = Array.from(grid.querySelectorAll("label"));
  labels.forEach((label)=>{
    const control = label.querySelector("input, select, textarea");
    const id = control?.id;
    if(!id || !HELP[id]) return;

    let titleText = "";
    for(const n of Array.from(label.childNodes)){
      if(n.nodeType === Node.TEXT_NODE){
        const t = (n.textContent || "").replace(/\s+/g, " ").trim();
        if(t){
          titleText = t;
          label.removeChild(n);
          break;
        }
      }
    }
    if(!titleText) titleText = id;

    const row = document.createElement("div");
    row.className = "setting-label-row";

    row.addEventListener("click", (e) => {
      e.preventDefault();
    });

    const title = document.createElement("span");
    title.textContent = titleText;

    title.addEventListener("click", (e) => {
      e.preventDefault();
    });

    const btn = document.createElement("span");
    btn.className = "setting-info-btn";
    btn.textContent = "i";
    btn.setAttribute("aria-label", `${titleText} の説明`);

    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      showInfoModal(titleText, HELP[id]);
    });

    row.appendChild(title);
    row.appendChild(btn);

    if(control){
      label.insertBefore(row, control);
    }else{
      label.prepend(row);
    }
  });
}

function removeSettingsInfoMark(){
  try{ document.getElementById("settings-info-btn")?.remove(); }catch(_e){}
}

// アプリケーション状態変数
let model = null;
let isAnalyzing = false;
let rafId = null;
let lastInferTime = 0;
let analysisStartTime = null;
let hourWindowStart = null;
let isModelBusy = false;

let geo = { lat: "未取得", lng: "未取得" };
const MAX_LOGS = 100;

const zeroCounts = () => ({
  car: 0, bus: 0, truck: 0, motorcycle: 0, bicycle: 0, person: 0
});
let countsCurrentHour = zeroCounts();

let recordsHourly = [];
let scheduleTimerStart = null;
let scheduleTimerEnd = null;

let frameIndex = 0;

// カウントモード設定
const LS_KEY_MODE  = "trafficCounter.countMode";

const LS_KEY_ROI   = "trafficCounter.roiNorm";

function normalizeMode(v){
  return (v === "pedestrian" || v === "person") ? "pedestrian" : "vehicle";
}

function modeLabel(m){
  return (m === "pedestrian") ? "歩行者カウントモード" : "車両カウントモード";
}

function modeNoun(){
  return (countMode === "pedestrian") ? "通行量" : "交通量";
}

let countMode  = normalizeMode(localStorage.getItem(LS_KEY_MODE)  || "vehicle");
const countLogic = "roi";

// ROI管理
let ROI_NORM = [
  {x: 0.35, y: 0.3}, {x: 0.65, y: 0.3}, 
  {x: 0.65, y: 0.7}, {x: 0.35, y: 0.7}
];
let roiLocked = false; 
try{
  const saved = localStorage.getItem(LS_KEY_ROI);
  if(saved){
    const obj = JSON.parse(saved);
    if(Array.isArray(obj) && obj.length === 4 && obj.every(p => isFinite(p.x) && isFinite(p.y))){
      ROI_NORM = obj;
    }
  }
}catch(_e){}

function getRoiPx(){
  const W = DOM.canvas.width || 1;
  const H = DOM.canvas.height || 1;
  return ROI_NORM.map(p => ({ x: p.x * W, y: p.y * H }));
}

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function getCanvasPoint(ev){
  const rect = DOM.canvas.getBoundingClientRect();

  const cw = DOM.canvas.width  || 1;
  const ch = DOM.canvas.height || 1;

  const scale = Math.min(rect.width / cw, rect.height / ch);

  const contentW = cw * scale;
  const contentH = ch * scale;
  const offsetX = (rect.width  - contentW) / 2;
  const offsetY = (rect.height - contentH) / 2;

  const xIn = (ev.clientX - rect.left - offsetX);
  const yIn = (ev.clientY - rect.top  - offsetY);

  const xClamped = Math.max(0, Math.min(contentW, xIn));
  const yClamped = Math.max(0, Math.min(contentH, yIn));

  return {
    x: xClamped / scale,
    y: yClamped / scale
  };
}

function saveRoi(){
  try{ localStorage.setItem(LS_KEY_ROI, JSON.stringify(ROI_NORM)); }catch(_e){}
}

// ROI操作・ドラッグ処理
