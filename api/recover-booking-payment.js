const Razorpay = require("razorpay");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!SUPABASE_URL || !SERVICE_KEY || !keyId || !keySecret) {
      return res.status(500).json({
        error: "Server configuration missing"
      });
    }

    // Verify signed-in guest.
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");

    if (!token) {
      return res.status(401).json({
        error: "Please sign in"
      });
    }

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid session"
      });
    }

    const user = await userResponse.json();

    const { orderId } = req.body || {};

    if (
      typeof orderId !== "string" ||
      !orderId.startsWith("order_")
    ) {
      return res.status(400).json({
        error: "Invalid Razorpay order ID"
      });
    }

    // Find the payment order belonging to this guest.
    const query = new URLSearchParams({
      razorpay_order_id: `eq.${orderId}`,
      guest_id: `eq.${user.id}`,
      select: "*"
    });

    const recordResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payment_orders?${query}`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        }
      }
    );

    if (!recordResponse.ok) {
      throw new Error("Unable to load payment record");
    }

    const records = await recordResponse.json();
    const record = records[0];

    if (!record) {
      return res.status(404).json({
        error: "Booking payment not found"
      });
    }

    if (record.status === "booking_confirmed") {
      return res.status(200).json({
        verified: true,
        bookingConfirmed: true,
        bookingId: record.booking_id
      });
    }

    if (
      !["pending", "paid"].includes(record.status)
    ) {
      return res.status(409).json({
        error: "Payment requires manual resolution"
      });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    // Ask Razorpay for the actual order.
    const order = await razorpay.orders.fetch(orderId);

    if (
      order.currency !== "INR" ||
      order.amount !== Number(record.amount_paise)
    ) {
      return res.status(400).json({
        error: "Payment amount does not match booking"
      });
    }

    // Find payments made against this Razorpay order.
    const payments = await razorpay.orders.fetchPayments(orderId);

    const capturedPayment = (payments.items || []).find(
      payment =>
        (!record.razorpay_payment_id ||
  payment.id === record.razorpay_payment_id) &&
        payment.order_id === orderId &&
        payment.status === "captured" &&
        payment.currency === "INR" &&
        payment.amount === Number(record.amount_paise)
    );

    if (!capturedPayment) {
      return res.status(409).json({
        error: "No captured payment found for this booking"
      });
    }

    
    // Atomically record the recovered payment.
    const recordPaymentResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/record_verified_payment`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_order_id: orderId,
          p_payment_id: capturedPayment.id
        })
      }
    );

    if (!recordPaymentResponse.ok) {
      console.error(
        "Recovery payment recording failed:",
        await recordPaymentResponse.text()
      );

      return res.status(409).json({
        error: "Payment needs manual review. Do not pay again."
      });
    }

    const recordedPayment = await recordPaymentResponse.json();

    if (!recordedPayment.success) {
      return res.status(409).json({
        error: "Unable to record recovered payment"
      });
    }


    // Confirm the booking using the protected database function.
    const confirmResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/confirm_paid_booking`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_order_id: orderId
        })
      }
    );

    if (!confirmResponse.ok) {
      throw new Error(
        "Unable to confirm recovered booking"
      );
    }

    const result = await confirmResponse.json();

    if (!result.success) {
      return res.status(409).json({
        verified: true,
        bookingConfirmed: false,
        error:
          "Payment was captured, but the room is unavailable. Refund or support is required."
      });
    }

    return res.status(200).json({
      verified: true,
      bookingConfirmed: true,
      bookingId: result.booking_id,
      paymentId: capturedPayment.id
    });

  } catch (error) {
    console.error(
      "Booking payment recovery failed:",
      error
    );

    return res.status(500).json({
      error: "Unable to recover booking payment"
    });
  }
};