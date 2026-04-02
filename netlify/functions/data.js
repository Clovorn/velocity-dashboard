const SUPABASE_URL = process.env.SUPABASE_URL || "https://cyctfzivrnapbqfbhfsn.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADMIN_PASSWORD   = process.env.ADMIN_PASSWORD   || "ronnoco-admin-2024";
const VIEWER_PASSWORDS = (process.env.VIEWER_PASSWORDS || "ronnoco-view-2024")
  .split(",").map(p => p.trim()).filter(Boolean);

function validateToken(token) {
  if (!token) return null;
  try {
    if (token.startsWith("admin_")) {
      const pw = Buffer.from(token.slice(6), "base64").toString();
      if (pw === ADMIN_PASSWORD) return "admin";
    }
    if (token.startsWith("viewer_")) {
      const pw = Buffer.from(token.slice(7), "base64").toString();
      if (VIEWER_PASSWORDS.includes(pw)) return "viewer";
    }
  } catch {}
  return null;
}

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} ${err}`);
  }
  return res.json();
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const token = event.headers["x-auth-token"] || "";
  const role = validateToken(token);
  if (!role) return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };

  try {
    // Get all uploads (metadata only — fast)
    const uploads = await sbFetch("uploads?select=*&order=month_key.asc");

    // Get recent log entries
    const log = await sbFetch("upload_log?select=msg,ok,created_at&order=created_at.desc&limit=50");

    // For each upload, attach its rows
    const result = await Promise.all(uploads.map(async (u) => {
      const rows = await sbFetch(
        `velocity_rows?upload_id=eq.${u.id}&select=whs,cust_name,group_name,cust_no,city,st,vendor,itemno,description,pack,size,qty,sales`
      );
      return {
        id: u.id,
        distributor: u.distributor,
        monthKey: u.month_key,
        month: u.month,
        year: u.year,
        uploadedAt: u.uploaded_at,
        rows: rows.map(r => ({
          whs: r.whs, custName: r.cust_name, groupName: r.group_name,
          custNo: r.cust_no, city: r.city, st: r.st, vendor: r.vendor,
          itemno: r.itemno, description: r.description, pack: r.pack,
          size: r.size, qty: +r.qty, sales: +r.sales,
        })),
      };
    }));

    // Get pricing
    const pricing = await sbFetch("pricing?select=distributor,itemno,sell_price,fee_flat,fee_pct,description");
    const pricingMap = {};
    pricing.forEach(p => {
      if (!pricingMap[p.distributor]) pricingMap[p.distributor] = {};
      pricingMap[p.distributor][p.itemno] = {
        sellPrice: +p.sell_price, feeFlat: +p.fee_flat,
        feePct: +p.fee_pct, description: p.description,
      };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploads: result,
        log: log.map(l => ({ msg: l.msg, ok: l.ok, at: l.created_at })),
        pricing: pricingMap,
        role,
      }),
    };
  } catch (error) {
    console.error("data.js error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, uploads: [], log: [] }) };
  }
};
