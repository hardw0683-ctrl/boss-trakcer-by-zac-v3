import { db, auth } from "./firebase-config.js";
import {
  ref,
  get,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

async function isUserAdmin(user) {
  if (!user) {
    return false;
  }
  try {
    const adminsRef = ref(db, "admins");
    const snapshot = await get(adminsRef);
    if (snapshot.exists()) {
      const admins = snapshot.val();
      return Object.keys(admins).includes(user.uid);
    }
    return false;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

export { isUserAdmin, onAuthStateChanged, auth };
