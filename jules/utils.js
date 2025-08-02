function sendOrderEmail(order) {
  emailjs
    .send("service_tziqb6x", "template_p7gg02w", {
      player: order.player,
      mission: order.mission,
      playersCount: order.playersCount,
      finalPrice: order.finalPrice.toLocaleString(),
      affiliate: order.affiliate || "None",
      status: order.status || "pending",
      timestamp: new Date().toLocaleString("en-GB"), // Adds readable date/time
    })
    .then(() => {
      console.log("✅ Email sent successfully");
    })
    .catch((error) => {
      console.error("❌ Failed to send email:", error);
    });
}

export { sendOrderEmail };
