// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCnsz6okpelwwtg5Ma0lLwhlEElkSD11Lw",
  authDomain: "bosstracker-1e7e4.firebaseapp.com",
  databaseURL: "https://bosstracker-1e7e4-default-rtdb.firebaseio.com",
  projectId: "bosstracker-1e7e4",
  storageBucket: "bosstracker-1e7e4.appspot.com",
  messagingSenderId: "923026736567",
  appId: "1:923026736567:web:4c3354383afffc58c31432",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Export the initialized services
export { db, auth, app };
