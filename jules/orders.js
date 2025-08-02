// Import Firebase modules
import { db } from "./firebase-config.js";
import { isUserAdmin, onAuthStateChanged, auth } from "./auth.js";
import { sendOrderEmail } from "./utils.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
  ref,
  onValue,
  onDisconnect,
  onChildAdded,
  set,
  remove,
  get,
  update,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

// Clear all completed orders function
async function clearAllCompletedOrders() {
  if (
    !confirm(
      "Are you sure you want to delete ALL completed orders? This action cannot be undone."
    )
  ) {
    return;
  }

  try {
    const ordersRef = ref(db, "orders");
    const snapshot = await get(ordersRef);

    if (!snapshot.exists()) {
      alert("No orders found.");
      return;
    }

    const orders = snapshot.val();
    const updates = {};

    // Mark completed orders for deletion
    for (const [key, order] of Object.entries(orders)) {
      if (order.status === "completed") {
        updates[key] = null; // null means delete this node in Firebase Realtime DB
      }
    }

    if (Object.keys(updates).length === 0) {
      alert("No completed orders to delete.");
      return;
    }

    await update(ordersRef, updates);
    alert("All completed orders have been deleted.");
  } catch (error) {
    console.error("Error clearing completed orders:", error);
    alert("Failed to clear completed orders: " + error.message);
  }
}

// Add event listener for the new button
document.addEventListener("DOMContentLoaded", () => {
  const clearBtn = document.getElementById("clearCompletedBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearAllCompletedOrders);
  }
});

async function updateAffiliateEarnings(affiliateName, finalPrice) {
  if (!affiliateName || typeof finalPrice !== "number") return;

  const affiliateRef = ref(db, `affiliates/${affiliateName}`);

  await runTransaction(affiliateRef, (currentData) => {
    if (currentData === null) {
      return { points: finalPrice * 0.1 };
    } else {
      return { points: (currentData.points || 0) + finalPrice * 0.1 };
    }
  });
}
async function completeOrder(orderKey, affiliateName, finalPrice) {
  try {
    const orderStatusRef = ref(db, `orders/${orderKey}`);
    await update(orderStatusRef, { status: "completed" });

    // Update affiliate earnings only if affiliate exists and finalPrice is a number
    if (affiliateName && typeof finalPrice === "number") {
      await updateAffiliateEarnings(affiliateName, finalPrice);
    }
  } catch (error) {
    console.error("Error completing order:", error);
    alert("Failed to mark order as completed: " + error.message);
  }
}

// Cache DOM elements
const ordersContent = document.getElementById("ordersContent");
const ordersList = document.getElementById("ordersList");
const logoutBtn = document.getElementById("logoutBtn");

// Show alert and redirect if not authorized
function denyAccess() {
  alert("Access Denied: Admins only.");
  window.location.href = "index.html";
}

// Monitor user auth state
onAuthStateChanged(auth, async (user) => {
  const isAdmin = await isUserAdmin(user);
  if (user && isAdmin) {
    // Authorized admin
    console.log("✅ Admin access granted:", user.uid);
    ordersContent.style.display = "block";
    loadOrders();
  } else {
    denyAccess();
  }
});
function renderAffiliateLeaderboard(affiliates) {
  const list = document.getElementById("affiliateList");
  if (!list) {
    console.warn("affiliateList element not found!");
    return;
  }

  list.innerHTML = "";

  const sorted = Object.entries(affiliates || {}).sort(
    (a, b) => (b[1]?.points || 0) - (a[1]?.points || 0)
  );

  for (const [name, data] of sorted) {
    const li = document.createElement("li");
    li.textContent = `${name}: ${data.points || 0} pts`;
    list.appendChild(li);
  }
}

// Logout button click handler
logoutBtn.addEventListener("click", () => {
  signOut(auth)
    .then(() => {
      window.location.href = "index.html";
    })
    .catch((err) => {
      alert("Logout failed: " + err.message);
    });
});

// Load and render orders with realtime updates and send email for new orders only
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}
// Store already-notified order IDs
const notifiedOrders = new Set(); // Put this OUTSIDE the function

function loadOrders() {
  const ordersRef = ref(db, "orders");

  onValue(ordersRef, (snapshot) => {
    const orders = snapshot.val() || {};

    const ordersListElement = document.getElementById("ordersList");
    const completedContainer = document.getElementById(
      "completedOrdersContainer"
    );

    if (ordersListElement) ordersListElement.innerHTML = "";
    if (completedContainer) completedContainer.innerHTML = "";

    Object.entries(orders).forEach(([key, order]) => {
      const orderBox = document.createElement("div");
      orderBox.className = "order-box";
      orderBox.innerHTML = `
  <p><strong>Player:</strong> ${order.player}</p>
  <p><strong>Mission:</strong> ${order.mission}</p>
  <p><strong>Players:</strong> ${order.playersCount}</p>
  <p><strong>Price:</strong> ${order.finalPrice.toLocaleString()}</p>
  <p><strong>Affiliate:</strong> ${order.affiliate || "—"}</p>
  <p><strong>Status:</strong> ${order.status}</p>
  ${
    order.status !== "completed"
      ? `
        <button class="completeBtn">✅ Mark as Completed</button>
        <button class="removeBtn">🗑️ Remove</button>
      `
      : ""
  }
`;

      // ✅ Only send email ONCE for new, uncompleted orders
      if (order.status !== "completed" && !notifiedOrders.has(key)) {
        sendOrderEmail(order);
        notifiedOrders.add(key);
      }

      if (order.status === "completed") {
        if (completedContainer) completedContainer.appendChild(orderBox);
      } else {
        const completeBtn = orderBox.querySelector(".completeBtn");
        const removeBtn = orderBox.querySelector(".removeBtn");
        if (completeBtn) {
          completeBtn.addEventListener("click", async () => {
            await completeOrder(key, order.affiliate, order.finalPrice);
            loadOrders(); // Refresh after completing
          });
        }
        if (removeBtn) {
          removeBtn.addEventListener("click", async () => {
            if (confirm("Are you sure you want to delete this order?")) {
              await remove(ref(db, `orders/${key}`));
              loadOrders();
            }
          });
        }

        if (ordersListElement) ordersListElement.appendChild(orderBox);
      }
      const removeBtn = orderBox.querySelector(".removeBtn");
    });
  });
}

// Simple sanitizer to prevent HTML injection
function sanitize(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[&<>"'`=\/]/g, (s) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
      "`": "&#x60;",
      "=": "&#x3D;",
    }[s];
  });
}
// function updateAffiliateLeaderboard(ordersData) {
//   // Aggregate earnings by affiliate name
//   const earnings = {};

//   Object.values(ordersData).forEach((order) => {
//     if (order.status === "completed" && order.affiliate) {
//       if (!earnings[order.affiliate]) earnings[order.affiliate] = 0;
//       earnings[order.affiliate] += order.reward * 0.1; // 10% credit
//     }
//   });

//   // Convert to array and sort descending
//   const sortedAffiliates = Object.entries(earnings).sort((a, b) => b[1] - a[1]);

//   const leaderboardDiv = document.getElementById("affiliateLeaderboard");
//   leaderboardDiv.innerHTML = ""; // Clear previous

//   if (sortedAffiliates.length === 0) {
//     leaderboardDiv.textContent = "No affiliate earnings yet.";
//     return;
//   }

//   const ul = document.createElement("ul");

//   sortedAffiliates.forEach(([affiliate, total]) => {
//     const li = document.createElement("li");
//     li.textContent = `${affiliate}: $${total.toFixed(2)}`;
//     ul.appendChild(li);
//   });

//   leaderboardDiv.appendChild(ul);
// }
function resetAffiliateLeaderboard() {
  const affiliatesRef = ref(db, "affiliates");
  remove(affiliatesRef)
    .then(() => {
      alert("Affiliate leaderboard has been reset.");
      const affiliateList = document.getElementById("affiliateList");
      if (affiliateList) {
        affiliateList.innerHTML = ""; // ✅ no error if not found
      }
    })
    .catch((error) => {
      console.error("Error resetting leaderboard:", error);
    });
}

document.getElementById("resetAffiliateBtn").addEventListener("click", () => {
  if (confirm("Are you sure you want to reset the affiliate leaderboard?")) {
    resetAffiliateLeaderboard();
  }
});
const affiliateList = document.getElementById("affiliateLeaderboard");

const affiliatesRef = ref(db, "affiliates");
onValue(affiliatesRef, (snapshot) => {
  const data = snapshot.val();
  renderAffiliateLeaderboard(data);
});
document.addEventListener("DOMContentLoaded", () => {
  const resetAffiliateBtn = document.getElementById("resetAffiliateBtn");
  if (resetAffiliateBtn) {
    resetAffiliateBtn.addEventListener("click", resetAffiliateLeaderboard);
  }
  document
    .getElementById("exportCSVBtn")
    .addEventListener("click", exportOrdersToCSV);
});
function formatNumber(num) {
  if (typeof num !== "number") return num;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function exportOrdersToCSV() {
  const ordersRef = ref(db, "orders");

  get(ordersRef).then((snapshot) => {
    if (!snapshot.exists()) {
      alert("No orders to export.");
      return;
    }

    const orders = snapshot.val();
    const rows = [
      [
        "Player",
        "Mission",
        "Players Count",
        "Final Price",
        "Affiliate",
        "Affiliate Earnings",
        "Status",
        "Timestamp",
      ],
    ];

    Object.values(orders).forEach((order) => {
      // Only export orders with status "completed"
      if (order.status !== "completed") return;

      const player = order.player || "";
      const mission = order.mission || "";
      const playersCount = order.playersCount || "";
      const finalPrice = order.finalPrice || 0;
      const affiliate = order.affiliate || "";
      const status = order.status || "";
      const timestamp = order.timestamp
        ? new Date(order.timestamp).toLocaleString()
        : "";

      const affiliateEarnings = affiliate ? Math.round(finalPrice * 0.1) : 0;

      rows.push([
        player,
        mission,
        playersCount,
        finalPrice,
        affiliate,
        affiliateEarnings,
        status,
        timestamp,
      ]);
    });

    // Convert to CSV
    const csvContent =
      "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");

    // Create a download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `completed_orders_export_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggleCompletedBtn");
  const completedContainer = document.getElementById(
    "completedOrdersContainer"
  );

  toggleBtn.addEventListener("click", () => {
    if (completedContainer.style.display === "none") {
      completedContainer.style.display = "block";
      toggleBtn.textContent = "Hide";
    } else {
      completedContainer.style.display = "none";
      toggleBtn.textContent = "Show";
    }
  });
});
