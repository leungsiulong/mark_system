// ================================================================
// Firebase Configuration
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
  const db = firebase.firestore();