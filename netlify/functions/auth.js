// ── Password configuration ────────────────────────────────────────
// Passwords are stored in Netlify Environment Variables (never in code)
// Set these in Netlify Dashboard → Site Configuration → Environment Variables:
//
//   ADMIN_PASSWORD   = your admin password (full access)
//   VIEWER_PASSWORDS = comma-separated viewer passwords, e.g. "view123,sales2024,partner1"
//
// If environment variables are not set, falls back to defaults below (change these!)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ronnoco-admin-2024";
const VIEWER_PASSWORDS = (process.env.VIEWER_PASSWORDS || "ronnoco-view-2024")
  .split(",")
  .map(p => p.trim())
  .filter(Boolean);

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { password } = JSON.parse(event.body || "{}");

    if (!password) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Password required" }) };
    }

    if (password === ADMIN_PASSWORD) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, role: "admin", token: "admin_" + Buffer.from(ADMIN_PASSWORD).toString("base64") }),
      };
    }

    if (VIEWER_PASSWORDS.includes(password)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, role: "viewer", token: "viewer_" + Buffer.from(password).toString("base64") }),
      };
    }

    // Wrong password — add small delay to prevent brute force
    await new Promise(r => setTimeout(r, 800));
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ ok: false, error: "Incorrect password" }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
