import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyDZLeyRtiMWyksPUsRtNrYntLtnW6-n0ts",
  authDomain: "my-placer-app.firebaseapp.com",
  projectId: "my-placer-app",
  storageBucket: "my-placer-app.firebasestorage.app",
  messagingSenderId: "768060668001",
  appId: "1:768060668001:web:760015cd1e98692ed31220"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
