import { db, auth } from "./firebase-config.js";
import {
  ref,
  onChildAdded,
  push,
  serverTimestamp,
  get,
  remove,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { isUserAdmin } from "./auth.js";

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const clearChatBtn = document.getElementById("clearChatBtn");

let currentUser = null;
let nickname = null;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      nickname = snapshot.val().nickname;
    }
    const isAdmin = await isUserAdmin(user);
    if (isAdmin) {
      clearChatBtn.style.display = "block";
    }
  } else {
    nickname = null;
    clearChatBtn.style.display = "none";
  }
});

const messagesRef = ref(db, "chat");

onChildAdded(messagesRef, async (snapshot) => {
  const message = snapshot.val();
  const messageElement = document.createElement("div");
  messageElement.classList.add("chat-message");

  const isAdmin = await isUserAdmin({ uid: message.uid });
  if (isAdmin) {
    messageElement.classList.add("admin-message");
  }

  const timestamp = new Date(message.timestamp).toLocaleTimeString();

  messageElement.innerHTML = `
    <span class="message-timestamp">${timestamp}</span>
    <span class="message-user">${message.user}:</span>
    <span class="message-text">${message.text}</span>
  `;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

clearChatBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear the chat?")) {
    remove(messagesRef);
  }
});

chatSendBtn.addEventListener("click", () => {
  if (!currentUser) {
    alert("الرجاء تسجيل الدخول أولا لتتمكن من الدردشة");
    return;
  }
  const messageText = chatInput.value.trim();
  if (messageText === "") {
    return;
  }

  let username = nickname || "Anonymous";

  const message = {
    user: username,
    text: messageText,
    timestamp: serverTimestamp(),
    uid: currentUser.uid,
  };

  push(messagesRef, message);
  chatInput.value = "";
});

chatInput.addEventListener("keyup", (event) => {
  if (event.key === "Enter") {
    chatSendBtn.click();
  }
});

export function updateNickname(newNickname) {
  nickname = newNickname;
}
