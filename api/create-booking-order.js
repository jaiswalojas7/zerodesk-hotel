const Razorpay = require("razorpay");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function serverHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    Accept: "application/json",
    ...extra
  };
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
      console.error("Booking order configuration is missing.");

      return res.status(500).json({
        error: "Server configuration missing"
      });
    }

    // Verify the signed-in guest.
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

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
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    if (!userResponse.ok) {
      console.error(
        "Supabase user verification failed:",
        userResponse.status,
        await userResponse.text()
      );

      return res.status(401).json({
        error: "Invalid session"
      });
    }

    const user = await userResponse.json();

    if (!user || !user.id) {
      return res.status(401).json({
        error: "Invalid session"
      });
    }

    // Validate room and dates.
    const { roomId, checkIn, checkOut } = req.body || {};

    const id = Number(roomId);

    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !validDate(checkIn) ||
      !validDate(checkOut)
    ) {
      return res.status(400).json({
        error: "Invalid room or dates"
      });
    }

    const start = Date.parse(`${checkIn}T00:00:00Z`);
    const end = Date.parse(`${checkOut}T00:00:00Z`);

    const nights = (end - start) / 86400000;

    const today = new Date()
      .toISOString()
      .slice(0, 10);

    if (
      checkIn < today ||
      nights < 1 ||
      nights > 30
    ) {
      return res.status(400).json({
        error: "Choose valid dates (maximum 30 nights)"
      });
    }

    // Fetch the trusted room price from Supabase.
    const roomParams = new URLSearchParams({
      id: `eq.${id}`,
      is_active: "eq.true",
      select: "id,price_per_night",
      limit: "1"
    });

    const roomUrl =
      `${SUPABASE_URL}/rest/v1/rooms?${roomParams.toString()}`;

    const roomResponse = await fetch(
      roomUrl,
      {
        method: "GET",
        headers: serverHeaders()
      }
    );

    if (!roomResponse.ok) {
      const errorText = await roomResponse.text();

      console.error(
        "Supabase room fetch failed:",
        roomResponse.status,
        errorText
      );

      return res.status(500).json({
        error: "Unable to load room information"
      });
    }

    const rooms = await readJson(roomResponse);

    if (!Array.isArray(rooms)) {
      console.error(
        "Supabase room response was not an array:",
        rooms
      );

      return res.status(500).json({
        error: "Unable to load room information"
      });
    }

    const room = rooms[0];

    if (!room) {
      return res.status(404).json({
        error: "Room unavailable"
      });
    }

    const pricePerNight = Number(
      room.price_per_night
    );

    if (
      !Number.isFinite(pricePerNight) ||
      pricePerNight <= 0
    ) {
      console.error(
        "Invalid room price returned by Supabase:",
        room
      );

      return res.status(500).json({
        error: "Invalid room price"
      });
    }

    const pricePaise = Math.round(
      pricePerNight * 100
    );

    const amount = pricePaise * nights;

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        error: "Invalid room price"
      });
    }

    // Check room availability before creating payment.
    const availabilityParams = new URLSearchParams({
      room_id: `eq.${id}`,
      status: "in.(confirmed,checked_in)",
      check_in: `lt.${checkOut}`,
      check_out: `gt.${checkIn}`,
      select: "id",
      limit: "1"
    });

    const availabilityResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings?${availabilityParams.toString()}`,
      {
        method: "GET",
        headers: serverHeaders()
      }
    );

    if (!availabilityResponse.ok) {
      console.error(
        "Supabase availability check failed:",
        availabilityResponse.status,
        await availabilityResponse.text()
      );

      return res.status(500).json({
        error: "Unable to check room availability"
      });
    }

    const existingBookings =
      await readJson(availabilityResponse);

    if (!Array.isArray(existingBookings)) {
      console.error(
        "Supabase availability response was not an array:",
        existingBookings
      );

      return res.status(500).json({
        error: "Unable to check room availability"
      });
    }

    if (existingBookings.length > 0) {
      return res.status(409).json({
        error: "Room already booked for these dates"
      });
    }

    // Create Razorpay order.
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });

    const order = await razorpay.orders.create({
      amount: amount,
      currency: "INR",
      receipt: `zd_${Date.now()}`
    });

    // Save pending booking payment in Supabase.
    const saveResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/payment_orders`,
      {
        method: "POST",

        headers: serverHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }),

        body: JSON.stringify({
          guest_id: user.id,
          room_id: id,
          check_in: checkIn,
          check_out: checkOut,
          amount_paise: amount,
          currency: "INR",
          razorpay_order_id: order.id,
          status: "pending"
        })
      }
    );

    if (!saveResponse.ok) {
      console.error(
        "Failed to save payment order:",
        saveResponse.status,
        await saveResponse.text()
      );

      return res.status(500).json({
        error: "Unable to prepare booking payment"
      });
    }

    return res.status(200).json({
      orderId: order.id,
      amount: amount,
      currency: "INR",
      keyId: keyId,
      nights: nights
    });

  } catch (error) {
    console.error(
      "Booking order failed:",
      error
    );

    return res.status(500).json({
      error: "Unable to create booking order"
    });
  }
};
