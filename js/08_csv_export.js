/*
  08_csv_export.js : CSV出力

  【このファイルが担当すること】
  - CSV生成とダウンロード(exportCSV)
  - タイムスタンプ整形/ファイル名生成

  【依存】
  - ログ配列/カウント値（グローバル状態）

  ※機能/UIは変更しない方針のため、ここでは“コメント追加のみ”を行っています。
*/

async /* CSVを生成してダウンロード（現場での記録保存） */
/* CSV出力：現場での記録保存用。メタ情報→イベントログの順で組み立てる */
function exportCSV(data, geo, unknown){
  if(!data || data.length === 0){
    toast("出力するデータがありません", true);
    return;
  }

  const endTime = new Date();
  const noun = modeNoun();

  const getUiText = (el) => {
    if(el && el.options && el.selectedIndex >= 0){
      return el.options[el.selectedIndex].text;
    }
    return "";
  };

  const metadata = [
    `緯度: ${geo.lat}`,
    `経度: ${geo.lng}`,
    `期間: ${formatTimestamp(analysisStartTime || new Date())} - ${formatTimestamp(endTime)}`,
    `測定対象: ${getUiText(DOM.countModeSelect)}`,
    `判定中心幅: ${getUiText(DOM.hitArea)}`,
    `検知感度: ${getUiText(DOM.scoreTh)}`,
    `解析頻度: ${getUiText(DOM.maxFps)}`,
    `見失い猶予: ${getUiText(DOM.maxLost)}`,
  ].join("\n");

  let header = "";
  let rows = "";

  if(countMode === "pedestrian"){
    header = "日時,歩行者\n"; 
    
    rows = data.map(r => {
      const person = r.person ?? 0;
      return `"${r.timestamp}",${person}`;
    }).join("\r\n");

  } else {
    header = "日時,乗用車,バス,トラック,バイク,自転車,合計\n";
    
    rows = data.map(r => {
      const car   = r.car ?? 0;
      const bus   = r.bus ?? 0;
      const truck = r.truck ?? 0;
      const moto  = r.motorcycle ?? 0;
      const bici  = r.bicycle ?? 0;

      const total = car + bus + truck + moto + bici;

      return `"${r.timestamp}",${car},${bus},${truck},${moto},${bici},${total}`;
    }).join("\r\n");
  }

  const csv = `\uFEFF${metadata}\n${header}${rows}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const name = fileNameFromDate(analysisStartTime || new Date(), noun);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast(`CSVファイル（${noun}）「${name}」を出力しました`);
}

function fileNameFromDate(d, noun){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  const h = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  const s = String(d.getSeconds()).padStart(2,"0");
  const kind = (noun === "通行量") ? "通行量" : "交通量";
  return `${kind}_${y}${m}${da}_${h}${mi}${s}.csv`;
}

// ユーティリティ関数
function toast(msg, isError=false){
  if(!DOM.toast){
    console.warn("[toast] element not found:", msg);
    return;
  }
  DOM.toast.textContent = msg;
  DOM.toast.style.backgroundColor = isError ? "rgba(229,57,53,.85)" : "rgba(0,0,0,.8)";
  DOM.toast.classList.remove("hidden");
  setTimeout(()=>DOM.toast.classList.add("hidden"), 3000);
}

/* CSV用に時刻を整形 */
function formatTimestamp(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  const h = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  const s = String(d.getSeconds()).padStart(2,"0");
  return `${y}/${m}/${da} ${h}:${mi}:${s}`;
}

// ROIロック機能
