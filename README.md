# ZeroDesk — Contactless Hotel Booking & Check-in System

**A modern hotel booking platform with a seamless, contactless check-in experience.**

🌐 **Live Website:** https://zerodesk-hotel.vercel.app
💻 **GitHub:** https://github.com/jaiswalojas7/zerodesk-hotel
👨‍💻 **Developed by:** Ojas Jaiswal

---

## About the Project

ZeroDesk is a web-based hotel booking and contactless check-in prototype designed to simplify the guest experience and reduce waiting times at hotel reception desks.

The platform combines a modern hotel-booking interface with online reservations, secure user authentication, digital QR check-in passes and an administrative dashboard.

## Key Features

### Guest Features

* Modern, responsive hotel-booking interface
* Automatic homepage image slider
* Room galleries with multiple photographs
* Room selection and date-based reservations
* User registration and login
* Personal booking dashboard
* Digital QR check-in passes
* Booking and checkout functionality

### Admin Features

* Protected administrative dashboard
* Booking management
* QR-based guest check-in
* Digital check-in verification
* Checkout management

## Technology Stack

| Technology          | Purpose                                |
| ------------------- | -------------------------------------- |
| HTML5               | Website structure                      |
| CSS3                | Responsive design and animations       |
| JavaScript          | Frontend functionality                 |
| Supabase Auth       | User authentication                    |
| Supabase PostgreSQL | Database                               |
| Supabase RPC        | Secure booking and check-in operations |
| GitHub              | Version control                        |
| Vercel              | Website hosting and deployment         |

## How ZeroDesk Works

1. A guest registers or signs in.
2. The guest explores available rooms and selects booking dates.
3. The guest submits a reservation.
4. The system generates a digital QR check-in pass.
5. Authorized hotel staff verify the pass through the admin interface.
6. The guest is checked in without a traditional reception process.
7. Checkout is recorded digitally.

## Project Structure

```text
zerodesk-hotel/
├── index.html
├── style.css
├── app.js
├── config.js
├── favicon.png
└── README.md
```

## Running the Project Locally

1. Download or clone the repository.
2. Open the project folder in VS Code.
3. Configure your own Supabase project and database.
4. Add your Supabase project URL and public publishable/anon key to `config.js`.
5. Start a local development server, such as VS Code Live Server.
6. Open the website in your browser.

**Security:** Never commit your Supabase service-role key or other private credentials.

## Live Demo

Visit https://zerodesk-hotel.vercel.app to explore the website.

## Project Limitations

ZeroDesk is an educational prototype. QR check-in and digital room access are simulated; the system does not operate physical hotel door locks.

Real-world deployment would require additional measures, including a payment gateway, compliant identity verification, operational security reviews and compatible smart-lock hardware.

## Future Enhancements

* Online payment gateway
* Real-time room inventory management
* Verified digital identity integration
* Smart-lock and NFC integration
* Email and SMS booking notifications
* Multi-hotel support
* Advanced analytics and reporting

---

**Developed by Ojas Jaiswal**
