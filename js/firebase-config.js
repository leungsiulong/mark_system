// ================================================================
// Firebase Configuration (v2 — Profile-scoped Firestore wrapper)
//   每位老師 (Profile) 的資料儲存在 profiles/{profileId}/... 之下，
//   透過 Proxy 包裝 db.collection / db.doc 自動加上 Profile 路徑前綴，
//   讓既有模組 (crud / grades / scoring ...) 完全無需改動即可資料隔離。
// ================================================================
const firebaseConfig = {
  apiKey: "AIzaSyD-h_psIAFc7XhHlOe1qSux_lkmoT4VRx0",
  authDomain: "marks-system-ccd71.firebaseapp.com",
  projectId: "marks-system-ccd71",
  storageBucket: "marks-system-ccd71.firebasestorage.app",
  messagingSenderId: "360201547320",
  appId: "1:360201547320:web:595c723c4e318e8faa80cd"
};
firebase.initializeApp(firebaseConfig);

// 真實 Firestore 實例（profiles 帳戶清單會直接使用此實例，不受 Profile 範圍影響）
const __realDb = firebase.firestore();

// 目前登入的 Profile（老師）ID；null = 尚未登入（指向根層級）
let __currentProfileId = null;
function __setProfileScope(profileId) { __currentProfileId = profileId || null; }
function __getProfileScope() { return __currentProfileId; }

// Profile-scoped 包裝：覆寫 collection / doc 以加上 profiles/{id} 前綴，其餘方法原樣轉發
const db = new Proxy(__realDb, {
  get(target, prop) {
    if (prop === 'collection') {
      return (name) => __currentProfileId
        ? target.collection('profiles').doc(__currentProfileId).collection(name)
        : target.collection(name);
    }
    if (prop === 'doc') {
      return (path) => __currentProfileId
        ? target.doc('profiles/' + __currentProfileId + '/' + path)
        : target.doc(path);
    }
    const val = Reflect.get(target, prop, target);
    return typeof val === 'function' ? val.bind(target) : val;
  }
});