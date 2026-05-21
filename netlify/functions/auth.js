exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { password } = JSON.parse(event.body || "{}");
    if (!password) return { statusCode: 400, headers, body: JSON.stringify({ error: "Password required" }) };

    const ADMIN = process.env.ADMIN_PASSWORD || "ronnoco2024";
    const VIEWERS = (process.env.VIEWER_PASSWORDS || "view2024")
      .split(",").map(p => p.trim()).filter(Boolean);

    console.log("Auth attempt - password length:", password.length);
    console.log("Admin match:", password === ADMIN);
    console.log("Viewer match:", VIEWERS.includes(password));
    console.log("Admin pw length:", ADMIN.length);

    if (password === ADMIN) {
      return { statusCode: 200, headers, body: JSON.stringify({ 
        ok: true, role: "admin", 
        token: "admin_" + Buffer.from(ADMIN).toString("base64") 
      })};
    }

    if (VIEWERS.includes(password)) {
      return { statusCode: 200, headers, body: JSON.stringify({ 
        ok: true, role: "viewer", 
        token: "viewer_" + Buffer.from(password).toString("base64") 
      })};
    }

    await new Promise(r => setTimeout(r, 500));
    return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: "Incorrect password" }) };

  } catch (err) {
    console.error("Auth error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
