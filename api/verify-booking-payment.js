
const crypto = require("crypto");
const Razorpay = require("razorpay");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function serverHeaders(extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    ...extra
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!url || !serviceKey || !keyId || !keySecret) {
      return res.status(500).json({
        error: "Server configuration missing"
      });
    }

    // Verify the logged-in guest.
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");

    if (!token) {
      return res.status(401).json({ error: "Please sign in" });
    }

    const userResponse = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${token}`
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const user = await userResponse.json();

    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature
    } = req.body || {};

    if (
      typeof orderId !== "string" ||
      typeof paymentId !== "string" ||
      typeof signature !== "string" ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      return res.status(400).json({
        error: "Invalid payment details"
      });
    }

    // Load the payment order belonging to this guest.
    const query = new URLSearchParams({
      razorpay_order_id: `eq.${orderId}`,
      guest_id: `eq.${user.id}`,
      select: "*"
    });

    const recordResponse = await fetch(
      `${url}/rest/v1/payment_orders?${query}`,
      { headers: serverHeaders() }
    );

    if (!recordResponse.ok) {
      throw new Error("Unable to load payment order");
    }

    const records = await recordResponse.json();
    const record = records[0];

    if (!record) {
      return res.status(404).json({
        error: "Booking payment not found"
      });
    }

    if (!["pending", "paid", "booking_confirmed"].includes(record.status)) {
      return res.status(409).json({
        error: "Payment requires manual resolution"
      });
    }

    // Verify Razorpay's signature.
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(signature, "hex")
      )
    ) {
      return res.status(400).json({
        error: "Invalid payment signature"
      });
    }

    // Independently fetch payment and order from Razorpay.
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    const [payment, order] = await Promise.all([
      razorpay.payments.fetch(paymentId),
      razorpay.orders.fetch(orderId)
    ]);

    if (
      payment.order_id !== orderId ||
      payment.status !== "captured" ||
      order.status !== "paid" ||
      payment.currency !== "INR" ||
      order.currency !== "INR" ||
      payment.amount !== Number(record.amount_paise) ||
      order.amount !== Number(record.amount_paise)
    ) {
      return res.status(400).json({
        error: "Payment has not been fully verified"
      });
    }

    if (
      record.razorpay_payment_id &&
      record.razorpay_payment_id !== paymentId
    ) {
      return res.status(409).json({
        error: "Different payment already recorded"
      });
    }
if (record.status === "booking_confirmed") {
  if (record.razorpay_payment_id !== paymentId) {
    return res.status(409).json({
      error: "Payment ID does not match this booking"
    });
  }

  return res.status(200).json({
    verified: true,
    bookingConfirmed: true,
    bookingId: record.booking_id
  });
}
    
    // Atomically record the independently verified payment.
    const recordPaymentResponse = await fetch(
      `${url}/rest/v1/rpc/record_verified_payment`,
      {
        method: "POST",
        headers: serverHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          p_order_id: orderId,
          p_payment_id: paymentId
        })
      }
    );

    if (!recordPaymentResponse.ok) {
      console.error(
        "Payment recording failed:",
        await recordPaymentResponse.text()
      );

      return res.status(409).json({
        error: "Payment captured, but booking needs recovery. Do not pay again."
      });
    }

    const recordedPayment = await recordPaymentResponse.json();

    if (!recordedPayment.success) {
      return res.status(409).json({
        error: "Unable to record verified payment"
      });
    }
    // The database function handles duplicate booking requests.
    const confirmResponse = await fetch(
      `${url}/rest/v1/rpc/confirm_paid_booking`,
      {
        method: "POST",
        headers: serverHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({ p_order_id: orderId })
      }
    );

    if (!confirmResponse.ok) {
      throw new Error("Booking confirmation failed");
    }

    const result = await confirmResponse.json();

    if (!result.success) {
      return res.status(409).json({
        verified: true,
        bookingConfirmed: false,
        error: "Payment captured, but room unavailable. Refund or support required."
      });
    }

    return res.status(200).json({
      verified: true,
      bookingConfirmed: true,
      bookingId: result.booking_id
    });

  } catch (error) {
    console.error("Booking payment verification failed:", error);

    return res.status(500).json({
      error: "Unable to complete booking verification"
    });
  }
};