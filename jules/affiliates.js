import { db, auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
  ref,
  onValue,
  get,
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in, get their nickname
    const userNickname = user.displayName;
    if (userNickname) {
      loadAffiliateData(userNickname);
    } else {
      // Handle case where user has no display name
      const earningsList = document.getElementById("earningsList");
      earningsList.innerHTML =
        "<li>Could not identify your nickname. Please set it on the main page.</li>";
    }
  } else {
    // User is not signed in
    window.location.href = "index.html";
  }
});

function loadAffiliateData(nickname) {
  const ordersRef = ref(db, "orders");

  onValue(ordersRef, (snapshot) => {
    const orders = snapshot.val() || {};
    const earningsList = document.getElementById("earningsList");
    const totalPointsSpan = document.getElementById("totalPoints");

    earningsList.innerHTML = ""; // Clear previous entries
    let totalEarnings = 0;

    const filteredOrders = Object.values(orders).filter(
      (order) => order.affiliate === nickname && order.status === "completed"
    );

    if (filteredOrders.length === 0) {
      earningsList.innerHTML = "<li>No completed affiliate sales found.</li>";
    } else {
      filteredOrders.forEach((order) => {
        const earnings = order.finalPrice * 0.1;
        totalEarnings += earnings;

        const orderBox = document.createElement("div");
        orderBox.className = "order-box";
        orderBox.innerHTML = `
                    <p><strong>Player:</strong> ${order.player}</p>
                    <p><strong>Mission:</strong> ${order.mission}</p>
                    <p><strong>Sale Amount:</strong> ${order.finalPrice.toLocaleString()}</p>
                    <p><strong>Your Earning:</strong> ${earnings.toLocaleString()} points</p>
                    <p><strong>Date:</strong> ${new Date(
                      order.timestamp
                    ).toLocaleDateString()}</p>
                `;
        earningsList.appendChild(orderBox);
      });
    }

    totalPointsSpan.textContent = totalEarnings.toLocaleString();
  });
}
