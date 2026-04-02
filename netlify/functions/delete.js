const SUPABASE_URL = process.env.SUPABASE_URL || "https://cyctfzivrnapbqfbhfsn.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ronnoco-admin-2024";

function isAdmin(token) {
  if (!token) return false;
  try {
    if (token.startsWith("admin_")) {
      const pw = Buffer.from(token.slice(6), "base64").toString();
      return pw === ADMIN_PASSWORD;
    }
  } catch {}
  return false;
}

async function sbFetch(path, method = "DELETE") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${err}`);
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const token = event.headers["x-auth-token"] || "";
  if (!isAdmin(token)) return { statusCode: 403, headers, body: JSON.stringify({ error: "Admin access required" }) };

  try {
    const body = JSON.parse(event.body);

    if (body.deleteAll) {
      // Delete all rows then all uploads (cascade handles velocity_rows)
      await sbFetch("velocity_rows?id=gt.0");
      await sbFetch("uploads?id=gt.0");
      await sbFetch("upload_log?id=gt.0");
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (body.monthKey && body.distributor) {
      // Delete specific month for specific distributor
      await sbFetch(`uploads?month_key=eq.${body.monthKey}&distributor=eq.${encodeURIComponent(body.distributor)}`);
      // velocity_rows deleted by cascade
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    if (body.distributor) {
      // Delete all data for a distributor
      await sbFetch(`uploads?distributor=eq.${encodeURIComponent(body.distributor)}`);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Provide monthKey+distributor, distributor, or deleteAll" }) };
  } catch (error) {
    console.error("delete error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
