exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { password } = JSON.parse(event.body || "{}");
    if (!password) return { statusCode: 400, headers, body: JSON.stringify({ error: "Password required" }) };

    // Admin password — change this to whatever you want
    const ADMIN = process.env.ADMIN_PASSWORD || "ronnoco-admin-2024";
    
    // Viewer passwords — comma separated
    const VIEWERS = (process.env.VIEWER_PASSWORDS || "ronnoco-view-2024")
      .split(",").map(p => p.trim()).filter(Boolean);

    console.log("Login attempt, checking admin:", password === ADMIN, "checking viewers:", VIEWERS.includes(password));

    if (password === ADMIN) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, role: "admin", token: "admin_" + Buffer.from(ADMIN).toString("base64") }) };
    }

    if (VIEWERS.includes(password)) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, role: "viewer", token: "viewer_" + Buffer.from(password).toString("base64") }) };
    }

    await new Promise(r => setTimeout(r, 800));
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: "Incorrect password — check your admin or viewer password" }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
