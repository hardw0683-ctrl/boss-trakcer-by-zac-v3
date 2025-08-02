import { db } from "./firebase-config.js";
import { isUserAdmin, onAuthStateChanged, auth } from "./auth.js";
import { sendOrderEmail } from "./utils.js";
import { updateNickname } from "./chat.js";
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
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
let currentUser = null;

let nickname = localStorage.getItem("nickname") || null;
let timerId = null;
const $ = (id) => document.getElementById(id);
let timerIds = {}; // Store all active timers per boss
let notificationsEnabled = true; // default ON

function resetNickname() {
  // Step 1: Remove the old nickname
  localStorage.removeItem("nickname");

  // Step 2: Remove old presence from Firebase (if exists)
  if (userPresenceRef) {
    remove(userPresenceRef);
    userPresenceRef = null;
  }

  // Step 3: Prompt for new nickname
  let newName = null;
  while (!newName || newName.trim().length < 2) {
    const input = prompt("Enter your new nickname (at least 2 characters):");
    if (input === null) {
      alert("Nickname change cancelled.");
      return;
    }
    newName = input.trim();
  }

  // Step 4: Save and update presence
  localStorage.setItem("nickname", newName);
  if (currentUser) {
    set(ref(db, `users/${currentUser.uid}/nickname`), newName);
  }

  // Step 5: Reconnect presence with new nickname
  userPresenceRef = push(presenceRef);
  set(userPresenceRef, {
    timestamp: Date.now(),
    isAdmin: true,
    nickname: newName,
  });
  onDisconnect(userPresenceRef).remove();

  $("userNickname").textContent = newName;
  updateNickname(newName);
  alert(`Nickname updated to "${newName}"`);
}

const presenceRef = ref(db, "presence");
const connectedRef = ref(db, ".info/connected");
let userPresenceRef = null;

onValue(presenceRef, (snapshot) => {
  const users = snapshot.val() || {};

  // Filter only admins who are online
  const onlineAdmins = Object.values(users).filter((user) => user.isAdmin);

  if (onlineAdmins.length > 0) {
    $("onlineUsers").textContent = `Online Admins (${
      onlineAdmins.length
    }): ${onlineAdmins.map((u) => u.nickname || "Admin").join(", ")}`;
  } else {
    $("onlineUsers").textContent = "No admins online";
  }
});

// Translation system
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
  $("chobosTitle").textContent = t.chobos;
  $("chainosTitle").textContent = t.chainos;
  $("skrabTitle").textContent = t.skrab;

  $("chobosReminder").textContent = t.setMinute;
  $("chobosLabel").textContent = t.inputLabel;
  $("startChobosTimerBtn").textContent = t.start;
  $("startChainosTimerBtn").textContent = t.chainosBtn;
  $("startSkrabTimerBtn").textContent = t.skrabBtn;
}

// Notifications + Voice
if (Notification.permission === "default") Notification.requestPermission();

function notify(title, body) {
  if (!notificationsEnabled) return; // skip if disabled
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "https://i.imgur.com/O4T22Mu.png" });
  }
}

function speak(message) {
  if (!notificationsEnabled) return; // skip if disabled
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(message);
    speechSynthesis.speak(u);
  }
  if (typeof responsiveVoice !== "undefined") {
    responsiveVoice.speak(message);
  }
}

// Timers
function formatTime(m, s) {
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const timerConfigs = {
  chobos: {
    timerId: "chobosTimer",
    intervalVar: null,
    spawnAction: {
      name: "Chobos",
      warned: false,
      onEnd: startChobosTimer,
      format: (diff) => formatTime(Math.floor(diff / 60), diff % 60),
    },
  },
  chainos: {
    timerId: "chainosTimer",
    intervalVar: null,
    spawnAction: {
      name: "Chainoc",
      warned: false,
      onEnd: startChainosTimer,
      format: (diff) => formatTime(Math.floor(diff / 60), diff % 60),
    },
  },
  skrab: {
    timerId: "skrabTimer",
    intervalVar: null,
    spawnAction: {
      name: "Skrab",
      warned: false,
      onEnd: () => {},
      format: (diff) => {
        const d_ = Math.floor(diff / 86400);
        const h = Math.floor((diff % 86400) / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        return `${d_}d ${h}h ${m}m ${s}s`;
      },
    },
  },
};

function startCountdown(timerName, targetTime) {
  const config = timerConfigs[timerName];
  if (config.intervalVar) clearInterval(config.intervalVar);
  config.spawnAction.warned = false;

  config.intervalVar = setInterval(() => {
    const diff = Math.floor((targetTime - Date.now()) / 1000);

    if (diff <= 0) {
      $(config.timerId).textContent = translations[currentLang].spawned;
      notify(config.spawnAction.name, translations[currentLang].spawned);
      speak(`${config.spawnAction.name} ${translations[currentLang].spawned}`);
      clearInterval(config.intervalVar);
      config.spawnAction.onEnd();
      return;
    }

    if (diff === 180 && !config.spawnAction.warned) {
      notify(config.spawnAction.name, "3 minutes left!");
      speak(`${config.spawnAction.name} will spawn in 3 minutes`);
      config.spawnAction.warned = true;
    }

    $(config.timerId).textContent = config.spawnAction.format(diff);
  }, 1000);
}

// Start timer functions that write to Firebase
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
    createdAt: serverTimestamp(), // for debug or future sync checks
    minuteInput: min,
    lastUpdatedBy:
      nickname || currentUser?.displayName || currentUser?.email || "Unknown",
  });
}

function startChainosTimer() {
  const now = new Date();
  const target = new Date();
  target.setHours(now.getHours() + 1, 0, 0, 0);

  set(ref(db, "timers/chainos"), {
    targetTime: target.getTime(),
    createdAt: serverTimestamp(), // for debug or future sync checks

    lastUpdatedBy:
      nickname || currentUser?.displayName || currentUser?.email || "Unknown",
  });
}

function startSkrabTimer() {
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  let next = new Date(utc);
  next.setUTCHours(18, 0, 0, 0);
  const day = utc.getUTCDay();

  if (day === 1 || day === 4) {
    if (utc < next) {
      // do nothing, next spawn is today at 18:00 UTC
    } else {
      next.setUTCDate(next.getUTCDate() + (day === 1 ? 3 : 4));
    }
  } else {
    const add = day < 1 ? 1 - day : day < 4 ? 4 - day : 8 - day;
    next.setUTCDate(next.getUTCDate() + add);
  }

  set(ref(db, "timers/skrab"), {
    targetTime: next.getTime(),
    lastUpdatedBy:
      nickname || currentUser?.displayName || currentUser?.email || "Unknown",
  });
}

// Firebase listeners with interval management
onValue(
  ref(db, "timers/chobos"),
  (snap) => {
    const d = snap.val();
    if (d) {
      $("chobosMinutes").value = d.minuteInput;
      startCountdown("chobos", d.targetTime);
      $(
        "chobosLastUpdated"
      ).textContent = `${translations[currentLang].lastUpdatedBy}: ${d.lastUpdatedBy}`;
    }
  },
  (error) => {
    console.error("Error getting chobos timer: ", error);
  }
);

onValue(
  ref(db, "timers/chainos"),
  (snap) => {
    const d = snap.val();
    if (d) {
      if (Date.now() >= d.targetTime) {
        $(timerConfigs.chainos.timerId).textContent =
          translations[currentLang].spawned;
        return;
      }
      startCountdown("chainos", d.targetTime);
      $(
        "chainosLastUpdated"
      ).textContent = `${translations[currentLang].lastUpdatedBy}: ${d.lastUpdatedBy}`;
    }
  },
  (error) => {
    console.error("Error getting chainos timer: ", error);
  }
);

onValue(
  ref(db, "timers/skrab"),
  (snap) => {
    const d = snap.val();
    if (d) {
      if (Date.now() >= d.targetTime) {
        $(timerConfigs.skrab.timerId).textContent =
          translations[currentLang].spawned;
        return;
      }
      startCountdown("skrab", d.targetTime);
      $(
        "skrabLastUpdated"
      ).textContent = `${translations[currentLang].lastUpdatedBy}: ${d.lastUpdatedBy}`;
    }
  },
  (error) => {
    console.error("Error getting skrab timer: ", error);
  }
);

translateUI();

const loginMessage = document.getElementById("loginMessage"); // at top, once

// Monitor authentication state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        // Remove old presence if exists
        if (userPresenceRef) {
          remove(userPresenceRef);
        }

        userPresenceRef = push(presenceRef);
        isUserAdmin(currentUser).then((isAdmin) => {
          set(userPresenceRef, {
            timestamp: Date.now(),
            isAdmin: isAdmin,
            nickname:
              nickname || (currentUser ? currentUser.displayName : "Unknown"),
          });
        });
        onDisconnect(userPresenceRef).remove();
      }
    });

    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      nickname = snapshot.val().nickname;
      localStorage.setItem("nickname", nickname);
    } else {
      // New user, prompt for nickname
      resetNickname();
    }

    const isAdmin = await isUserAdmin(user);
    if (isAdmin) {
      $("chobosReminder").style.display = "inline-block";
      $("startChobosTimerBtn").style.display = "inline-block";
      $("startChainosTimerBtn").style.display = "inline-block";
      $("startSkrabTimerBtn").style.display = "inline-block";
      $("chobosLabel").style.display = "inline-block";
      $("chobosMinutes").style.display = "inline-block";
      $("changeNameBtn").style.display = "inline-block";
      // Enable buttons for authorized user
      $("dropsBtn").disabled = false;
      $("dropsBtn").style.opacity = "1";
      $("dropsBtn").style.cursor = "pointer";

      $("ordersBtn").disabled = false;
      $("ordersBtn").style.opacity = "1";
      $("ordersBtn").style.cursor = "pointer";

      // Show private section + logout
      $("privateSection").style.display = "block";
      $("logoutBtn").style.display = "inline-block";

      // Hide login inputs
      $("loginForm").style.display = "none";
    } else {
      // Not an admin, but logged in
      $("loginForm").style.display = "none";
      $("logoutBtn").style.display = "inline-block";
    }
    $("userMenu").style.display = "block";
    $("userNickname").textContent = nickname;
  } else {
    // Not logged in
    if (userPresenceRef) {
      remove(userPresenceRef);
      userPresenceRef = null;
    }
    currentUser = null;
    nickname = null;
    localStorage.removeItem("nickname");
    $("userMenu").style.display = "none";

    $("chobosReminder").style.display = "none";
    $("startChobosTimerBtn").style.display = "none";
    $("startChainosTimerBtn").style.display = "none";
    $("startSkrabTimerBtn").style.display = "none";
    $("changeNameBtn").style.display = "none";
    $("chobosLabel").style.display = "none";
    $("chobosMinutes").style.display = "none";
    // Hide private section
    $("privateSection").style.display = "none";
    $("logoutBtn").style.display = "none";

    // Show login inputs
    $("loginForm").style.display = "block";
    $("signUpForm").style.display = "none";

    // Disable buttons
    $("dropsBtn").disabled = true;
    $("dropsBtn").style.opacity = "0.5";
    $("dropsBtn").style.cursor = "not-allowed";

    $("ordersBtn").disabled = true;
    $("ordersBtn").style.opacity = "0.5";
    $("ordersBtn").style.cursor = "not-allowed";
    $("ordersBtn").disabled = true;
    $("ordersBtn").style.opacity = "0.5";
    $("ordersBtn").style.cursor = "not-allowed";
    $("ordersBtn").onclick = null;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const userIcon = $("userIcon");
  const userDropdown = $("userDropdown");

  if (userIcon) {
    userIcon.addEventListener("click", () => {
      userDropdown.style.display =
        userDropdown.style.display === "none" ? "block" : "none";
    });
  }

  const notificationsOnBtn = $("notificationsOnBtn");
  const notificationsOffBtn = $("notificationsOffBtn");

  if (notificationsOnBtn) {
    notificationsOnBtn.addEventListener("click", () => {
      notificationsEnabled = false;
      notificationsOnBtn.style.display = "none";
      notificationsOffBtn.style.display = "block";
    });
  }

  if (notificationsOffBtn) {
    notificationsOffBtn.addEventListener("click", () => {
      notificationsEnabled = true;
      notificationsOnBtn.style.display = "block";
      notificationsOffBtn.style.display = "none";
    });
  }

  const changeNameBtn = $("changeNameBtn");
  if (changeNameBtn) {
    changeNameBtn.addEventListener("click", resetNickname);
  }

  const dropButton = document.getElementById("dropsBtn");
  const dropForm = document.getElementById("dropForm");

  if (dropButton && dropForm) {
    dropButton.addEventListener("click", () => {
      document.querySelectorAll(".section").forEach((section) => {
        section.style.display = "none";
      });
      dropForm.style.display = "block";
    });
  } else {
    console.warn("dropsBtn or dropForm not found in the DOM.");
  }

  const lootButton = document.getElementById("lootButton");
  if (lootButton) {
    lootButton.addEventListener("click", () => {
      window.location.href = "newpage.html"; // Or any target page
    });
  }

  document.getElementById("submitOrderBtn").addEventListener("click", () => {
    const missionSelect = document.getElementById("missionSelect");
    const mission = missionSelect.value;

    const basePriceStr =
      missionSelect.options[missionSelect.selectedIndex]?.dataset?.value || "0";
    const basePrice = parseInt(basePriceStr, 10);

    const name = document.getElementById("playerName").value.trim();
    const affiliate = document.getElementById("affiliateName").value.trim();
    const messageBox = document.getElementById("orderMessage");

    // Get number of players as a string, convert to integer directly
    const playersCountStr = document.getElementById("playersCount").value;
    const playersNumber = parseInt(playersCountStr, 10) || 1; // fallback 1 if invalid

    // Calculate discount based on playersNumber
    let discount = 0;
    if (playersNumber >= 2 && playersNumber <= 4) {
      discount = 0.1; // 10% discount for 2-4 players
    } else if (playersNumber >= 5) {
      discount = 0.2; // 20% discount for 5+ players
    }

    // Calculate price before discount
    const totalBeforeDiscount = basePrice * playersNumber;

    // Calculate final price after discount
    const finalPrice = Math.round(totalBeforeDiscount * (1 - discount));

    if (!mission || !name) {
      messageBox.textContent = "Please enter your name and select a mission.";
      messageBox.style.color = "#ff6666";
      return;
    }

    const order = {
      player: name,
      mission,
      playersCount: playersNumber.toString(), // store exact number as string if you want
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

  // Cache the dropdown and discount display span
  const playersCountSelect = document.getElementById("playersCount");
  const discountDisplay = document.getElementById("discountDisplay");

  // Function to update discount text
  function updateDiscount() {
    const value = parseInt(playersCountSelect.value, 10);

    let discountText = "";
    if (value >= 2 && value <= 4) {
      discountText = "-10%";
    } else if (value >= 5) {
      discountText = "-20%";
    } else {
      discountText = ""; // No discount for 1 player
    }

    discountDisplay.textContent = discountText;
  }

  // Listen for changes on the dropdown
  playersCountSelect.addEventListener("change", updateDiscount);

  // Initialize on page load
  updateDiscount();

  $("googleSignInBtn").addEventListener("click", () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch((error) => {
      loginMessage.textContent = "Google Sign-In failed: " + error.message;
      loginMessage.classList.add("error");
    });
  });

  // Logout button logic
  $("logoutBtn").addEventListener("click", () => {
    signOut(auth);
  });

  $("startChobosTimerBtn").addEventListener("click", () => {
    if (!currentUser) {
      alert("Only authorized users can start timers.");
      return;
    }
    startChobosTimer();
  });

  $("startChainosTimerBtn").addEventListener("click", () => {
    if (!currentUser) {
      alert("Only authorized users can start timers.");
      return;
    }
    startChainosTimer();
  });

  $("startSkrabTimerBtn").addEventListener("click", () => {
    if (!currentUser) {
      alert("Only authorized users can start timers.");
      return;
    }
    startSkrabTimer();
  });

  $("dropsBtn").addEventListener("click", () => {
    if (!currentUser) {
      alert("⚠️ You must log in to access the drop form.");
      return;
    }

    // User is logged in, go to form
    window.location.href = "newpage.html"; // or show form
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
});
document.getElementById("dropsBtn").addEventListener("click", () => {
  window.open("newpage.html", "_blank");
});

document.getElementById("ordersBtn").addEventListener("click", () => {
  window.open("orders.html", "_blank");
});
const toggleBtn = $("toggleNotificationsBtn");
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    notificationsEnabled = !notificationsEnabled;

    // Get the image inside the button
    const img = toggleBtn.querySelector("img");

    // Swap image based on state
    img.src = notificationsEnabled
      ? "icons/notification-on-svgrepo-com.svg"
      : "icons/notification-off-svgrepo-com.svg";

    img.alt = notificationsEnabled ? "Notifications ON" : "Notifications OFF";
  });
}
