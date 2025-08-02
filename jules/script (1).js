import { db } from "./firebase-config.js";
import { isUserAdmin, onAuthStateChanged, auth } from "./auth.js";
import { sendOrderEmail } from "./utils.js";
import {
  ref,
  set,
  onValue,
  push,
  onDisconnect,
  remove,
  serverTimestamp,
  get,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import {
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";

function init() {
  let currentUser = null;
  let nickname = localStorage.getItem("nickname") || null;
  let timerIds = {};
  let notificationsEnabled = true;
  let userPresenceRef = null;

  const presenceRef = ref(db, "presence");
  const connectedRef = ref(db, ".info/connected");
  const $ = (id) => document.getElementById(id);

  function resetNickname() {
    localStorage.removeItem("nickname");
    if (userPresenceRef) {
      remove(userPresenceRef);
      userPresenceRef = null;
    }
    let newName = null;
    while (!newName || newName.trim().length < 2) {
      const input = prompt("Enter your new nickname (at least 2 characters):");
      if (input === null) {
        alert("Nickname change cancelled.");
        return;
      }
      newName = input.trim();
    }
    localStorage.setItem("nickname", newName);
    nickname = newName;
    if (currentUser) {
      set(ref(db, `users/${currentUser.uid}/nickname`), newName);
    }
    alert(`Nickname updated to "${newName}"`);
    $("userNickname").textContent = newName;
  }

  const translations = {
    en: {
      chobos: "Chobos",
      chainos: "Chainoc",
      skrab: "Skrab",
      madeBy: "Made by Zac",
      setMinute: "Chobos Minute Set To:",
      inputLabel: "Minutes (0-59):",
      start: "Start Timer",
      chainosBtn: "Start Timer",
      skrabBtn: "Start Timer",
      spawned: "SPAWNED!",
      lastUpdatedBy: "Last updated by",
    },
    ar: {
      chobos: "تشوبوس",
      chainos: "شاينوك",
      skrab: "سكارب",
      madeBy: "صنع بواسطة زاك",
      setMinute: "تشوبوس مضبوط على الدقيقة:",
      inputLabel: "الدقائق (0-59):",
      start: "ابدأ المؤقت",
      chainosBtn: "ابدأ المؤقت",
      skrabBtn: "ابدأ المؤقت",
      spawned: "تم الظهور!",
      lastUpdatedBy: "آخر تعديل بواسطة",
    },
  };
  let currentLang = localStorage.getItem("lang") || "ar";

  function translateUI() {
    const t = translations[currentLang];
    if($("chobosTitle")) $("chobosTitle").textContent = t.chobos;
    if($("chainosTitle")) $("chainosTitle").textContent = t.chainos;
    if($("skrabTitle")) $("skrabTitle").textContent = t.skrab;
    if($("chobosReminder")) $("chobosReminder").textContent = t.setMinute;
    if($("chobosLabel")) $("chobosLabel").textContent = t.inputLabel;
    if($("startChobosTimerBtn")) $("startChobosTimerBtn").textContent = t.start;
    if($("startChainosTimerBtn")) $("startChainosTimerBtn").textContent = t.chainosBtn;
    if($("startSkrabTimerBtn")) $("startSkrabTimerBtn").textContent = t.skrabBtn;
  }

  function notify(title, body) {
    if (!notificationsEnabled) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/anonymous.png" });
    }
  }

  function speak(message) {
    if (!notificationsEnabled) return;
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(message);
      speechSynthesis.speak(u);
    }
    if (typeof responsiveVoice !== "undefined") {
      responsiveVoice.speak(message);
    }
  }

  function formatTime(m, s) {
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function startCountdown(refName, timerId, intervalVar, spawnAction) {
    if (intervalVar) clearInterval(intervalVar);
    spawnAction.warned = false;
    const newInterval = setInterval(() => {
      const diff = Math.floor((spawnAction.targetTime - Date.now()) / 1000);
      if (diff <= 0) {
        if($(timerId)) $(timerId).textContent = translations[currentLang].spawned;
        notify(spawnAction.name, translations[currentLang].spawned);
        speak(`${spawnAction.name} ${translations[currentLang].spawned}`);
        clearInterval(newInterval);
        spawnAction.onEnd();
        return;
      }
      if (diff === 180 && !spawnAction.warned) {
        notify(spawnAction.name, "3 minutes left!");
        speak(`${spawnAction.name} will spawn in 3 minutes`);
        spawnAction.warned = true;
      }
      if($(timerId)) $(timerId).textContent = spawnAction.format(diff);
    }, 1000);
    return newInterval;
  }

  function startChobosTimer() {
    const min = parseInt($("chobosMinutes").value);
    if (isNaN(min) || min < 0 || min > 59) return alert("Enter a valid minute.");
    const now = new Date();
    const target = new Date();
    if (min > now.getMinutes()) {
      target.setMinutes(min, 0, 0);
    } else {
      target.setHours(now.getHours() + 1, min, 0, 0);
    }
    set(ref(db, "timers/chobos"), {
      targetTime: target.getTime(),
      createdAt: serverTimestamp(),
      minuteInput: min,
      lastUpdatedBy: nickname || currentUser?.displayName || currentUser?.email || "Unknown",
    });
  }

  function startChainosTimer() {
    const now = new Date();
    const target = new Date();
    target.setHours(now.getHours() + 1, 0, 0, 0);
    set(ref(db, "timers/chainos"), {
      targetTime: target.getTime(),
      createdAt: serverTimestamp(),
      lastUpdatedBy: nickname || currentUser?.displayName || currentUser?.email || "Unknown",
    });
  }

  function startSkrabTimer() {
    const now = new Date();
    const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    let next = new Date(utc);
    next.setUTCHours(18, 0, 0, 0);
    const day = utc.getUTCDay();
    if (day === 1 || day === 4) {
      if (utc >= next) {
        next.setUTCDate(next.getUTCDate() + (day === 1 ? 3 : 4));
      }
    } else {
      const add = day < 1 ? 1 - day : day < 4 ? 4 - day : 8 - day;
      next.setUTCDate(next.getUTCDate() + add);
    }
    set(ref(db, "timers/skrab"), {
      targetTime: next.getTime(),
      lastUpdatedBy: nickname || currentUser?.displayName || currentUser?.email || "Unknown",
    });
  }

  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
  
  translateUI();

  onValue(ref(db, "timers/chobos"), (snap) => {
    const d = snap.val();
    if (d) {
      if($("chobosMinutes")) $("chobosMinutes").value = d.minuteInput;
      timerIds.chobos = startCountdown("chobos", "chobosTimer", timerIds.chobos, {
        name: translations[currentLang].chobos,
        targetTime: d.targetTime,
        warned: false,
        onEnd: startChobosTimer,
        format: (diff) => formatTime(Math.floor(diff / 60), diff % 60),
      });
      if($("chobosLastUpdated")) $("chobosLastUpdated").textContent = `${translations[currentLang].lastUpdatedBy}: ${d.lastUpdatedBy}`;
    }
  });

  onValue(ref(db, "timers/chainos"), (snap) => {
    const d = snap.val();
    if (d) {
      timerIds.chainos = startCountdown("chainos", "chainosTimer", timerIds.chainos, {
        name: translations[currentLang].chainos,
        targetTime: d.targetTime,
        warned: false,
        onEnd: startChainosTimer,
        format: (diff) => formatTime(Math.floor(diff / 60), diff % 60),
      });
      if($("chainosLastUpdated")) $("chainosLastUpdated").textContent = `${translations[currentLang].lastUpdatedBy}: ${d.lastUpdatedBy}`;
    }
  });

  onValue(ref(db, "timers/skrab"), (snap) => {
    const d = snap.val();
    if (d) {
      timerIds.skrab = startCountdown("skrab", "skrabTimer", timerIds.skrab, {
        name: translations[currentLang].skrab,
        targetTime: d.targetTime,
        warned: false,
        onEnd: () => {},
        format: (diff) => {
          const d_ = Math.floor(diff / 86400);
          const h = Math.floor((diff % 86400) / 3600);
          const m = Math.floor((diff % 3600) / 60);
          const s = diff % 60;
          return `${d_}d ${h}h ${m}m ${s}s`;
        },
      });
      if($("skrabLastUpdated")) $("skrabLastUpdated").textContent = `${translations[currentLang].lastUpdatedBy}: ${d.lastUpdatedBy}`;
    }
  });
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      const userRef = ref(db, `users/${user.uid}`);
      const snapshot = await get(userRef);
      if (snapshot.exists()) {
        nickname = snapshot.val().nickname;
        localStorage.setItem("nickname", nickname);
      } else {
        resetNickname();
      }

      $("authSection").style.display = "none";
      $("userMenu").style.display = "flex";
      $("userNickname").textContent = nickname;

      const isAdmin = await isUserAdmin(user);

      if (isAdmin) {
        onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
            if (userPresenceRef) {
              remove(userPresenceRef);
            }
            userPresenceRef = push(presenceRef);
            set(userPresenceRef, {
              timestamp: Date.now(),
              isAdmin: true,
              nickname: nickname,
            });
            onDisconnect(userPresenceRef).remove();
          }
        });
        
        onValue(presenceRef, (snapshot) => {
          const users = snapshot.val() || {};
          const onlineAdmins = Object.values(users).filter((user) => user.isAdmin);
          if (onlineAdmins.length > 0) {
            $("onlineUsers").textContent = `Online Admins (${onlineAdmins.length}): ${onlineAdmins.map((u) => u.nickname).join(", ")}`;
          } else {
            $("onlineUsers").textContent = "No admins online";
          }
        });
      }
      
      $("chobosReminder").style.display = "inline-block";
      $("startChobosTimerBtn").style.display = "inline-block";
      $("startChainosTimerBtn").style.display = "inline-block";
      $("startSkrabTimerBtn").style.display = "inline-block";
      $("chobosLabel").style.display = "inline-block";
      $("chobosMinutes").style.display = "inline-block";
      $("dropsBtn").disabled = !isAdmin;
      $("dropsBtn").style.opacity = isAdmin ? "1" : "0.5";
      $("dropsBtn").style.cursor = isAdmin ? "pointer" : "not-allowed";
      $("ordersBtn").disabled = !isAdmin;
      $("ordersBtn").style.opacity = isAdmin ? "1" : "0.5";
      $("ordersBtn").style.cursor = isAdmin ? "pointer" : "not-allowed";
      $("privateSection").style.display = isAdmin ? "block" : "none";
      $("dropsBtn").style.display = "inline-block";
      $("ordersBtn").style.display = "inline-block";
    } else {
      currentUser = null;
      nickname = null;
      localStorage.removeItem("nickname");
      $("authSection").style.display = "block";
      $("userMenu").style.display = "none";
      $("chobosReminder").style.display = "none";
      $("startChobosTimerBtn").style.display = "none";
      $("startChainosTimerBtn").style.display = "none";
      $("startSkrabTimerBtn").style.display = "none";
      $("privateSection").style.display = "none";
      $("dropsBtn").disabled = true;
      $("dropsBtn").style.opacity = "0.5";
      $("dropsBtn").style.cursor = "not-allowed";
      $("ordersBtn").disabled = true;
      $("ordersBtn").style.opacity = "0.5";
      $("ordersBtn").style.cursor = "not-allowed";
    }
  });

  $("loginBtn").addEventListener("click", () => {
    const email = $("emailInput").value;
    const password = $("passwordInput").value;
    signInWithEmailAndPassword(auth, email, password).catch((error) => {
      $("loginMessage").textContent = "Login failed: " + error.message;
    });
  });

  $("googleSignInBtn").addEventListener("click", () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch((error) => {
      $("loginMessage").textContent = "Google Sign-In failed: " + error.message;
    });
  });

  $("logoutBtn").addEventListener("click", () => {
    if (userPresenceRef) {
        remove(userPresenceRef);
    }
    signOut(auth);
  });

  $("changeNameBtn").addEventListener("click", resetNickname);

  $("userIcon").addEventListener("click", () => {
    const dropdown = $("userDropdown");
    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
  });

  $("langEN").addEventListener("click", () => {
    currentLang = "en";
    localStorage.setItem("lang", "en");
    translateUI();
  });

  $("langAR").addEventListener("click", () => {
    currentLang = "ar";
    localStorage.setItem("lang", "ar");
    translateUI();
  });

  $("toggleNotificationsBtn").addEventListener("click", () => {
    notificationsEnabled = !notificationsEnabled;
    $("toggleNotificationsBtn").textContent = `Notifications: ${notificationsEnabled ? "ON" : "OFF"}`;
  });
  
  $("submitOrderBtn").addEventListener("click", () => {
    const missionSelect = document.getElementById("missionSelect");
    const mission = missionSelect.value;
    const basePriceStr = missionSelect.options[missionSelect.selectedIndex]?.dataset?.value || "0";
    const basePrice = parseInt(basePriceStr, 10);
    const name = document.getElementById("playerName").value.trim();
    const affiliate = document.getElementById("affiliateName").value.trim();
    const messageBox = document.getElementById("orderMessage");
    const playersCountStr = document.getElementById("playersCount").value;
    const playersNumber = parseInt(playersCountStr, 10) || 1;
    let discount = 0;
    if (playersNumber >= 2 && playersNumber <= 4) {
      discount = 0.1;
    } else if (playersNumber >= 5) {
      discount = 0.2;
    }
    const totalBeforeDiscount = basePrice * playersNumber;
    const finalPrice = Math.round(totalBeforeDiscount * (1 - discount));
    if (!mission || !name) {
      messageBox.textContent = "Please enter your name and select a mission.";
      messageBox.style.color = "#ff6666";
      return;
    }
    const order = {
      player: name,
      mission,
      playersCount: playersNumber.toString(),
      finalPrice,
      affiliate: affiliate || "",
      timestamp: Date.now(),
      status: "pending",
    };
    push(ref(db, "orders"), order)
      .then(() => {
        messageBox.textContent = "Mission order submitted!";
        messageBox.style.color = "#00ff99";
        sendOrderEmail(order);
        setTimeout(() => {
          messageBox.textContent = "";
        }, 4000);
      })
      .catch((err) => {
        messageBox.textContent = "Error submitting order: " + err.message;
        messageBox.style.color = "#ff6666";
      });
  });

  const playersCountSelect = document.getElementById("playersCount");
  const discountDisplay = document.getElementById("discountDisplay");
  function updateDiscount() {
    const value = parseInt(playersCountSelect.value, 10);
    let discountText = "";
    if (value >= 2 && value <= 4) {
      discountText = "-10%";
    } else if (value >= 5) {
      discountText = "-20%";
    } else {
      discountText = "";
    }
    discountDisplay.textContent = discountText;
  }
  playersCountSelect.addEventListener("change", updateDiscount);
  updateDiscount();

  $("startChobosTimerBtn").addEventListener("click", startChobosTimer);
  $("startChainosTimerBtn").addEventListener("click", startChainosTimer);
  $("startSkrabTimerBtn").addEventListener("click", startSkrabTimer);
  $("dropsBtn").addEventListener("click", () => {
    window.location.href = "newpage.html";
  });
  $("ordersBtn").addEventListener("click", () => {
    window.open("orders.html", "_blank");
  });
}

document.addEventListener("DOMContentLoaded", init);
