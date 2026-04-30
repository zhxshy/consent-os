import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCBbSZ_1dVknzzB5miZTeKTfKcj_JFeMPo",
  authDomain: "consentos-b11c6.firebaseapp.com",
  projectId: "consentos-b11c6",
  storageBucket: "consentos-b11c6.firebasestorage.app",
  messagingSenderId: "540265681758",
  appId: "1:540265681758:web:d3847a61eab310ac57b5cf",
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
