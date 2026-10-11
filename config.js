window.APP_CONFIG = {
  // Firebase の設定（Firebaseコンソール →「プロジェクトの設定」→「マイアプリ」からコピー）
  // apiKey か databaseURL が空のままだと「デモモード」になり、このPCのブラウザ内だけで動きます
  firebase: {
    apiKey: "AIzaSyAE-RJ0CU_BmfshkGShEJYLI6tQuxLEGtg",
    authDomain: "kaduki10sec.firebaseapp.com",
    databaseURL: "https://kaduki10sec-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "998256790342",
    appId: "1:998256790342:web:9128e28b71011e52ea7347"
  },

  eventName: "華月祭　2026　クリエイティブ部署",        // 画面上部に小さく出す名前（例: "華月祭 2026"）。空なら非表示
  target: 10,           // 目標の秒数
  digits: 3,            // 小数の桁数（2 = 1/100秒、3 = 1/1000秒）
  boardSize: 50,        // ランキングに表示する人数
  triggerKeys: ["F9"],  // 外部ボタンに割り当てるキー。入力欄にカーソルがあっても反応します
  blindSec: 3,          // スタートから何秒で数字を隠すか（受付画面で変更可）
  qrUrl: ""             // QRコードに載せるURL。空なら公開中のランキングページのURLを自動で使います
};
