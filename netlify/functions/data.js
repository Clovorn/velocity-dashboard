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

// Fetch a single page from Supabase using Range header
async function sbPage(path, from, to) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Range-Unit": "items",
      "Range": `${from}-${to}`,
    },
  });
  // 200 = full result, 206 = partial (more pages exist)
  if (res.status !== 200 && res.status !== 206) {
    const err = await res.text();
    throw new Error(`Supabase ${path} [${from}-${to}]: ${res.status} ${err}`);
  }
  const data = await res.json();
  const hasMore = res.status === 206;
  return { data, hasMore };
}

// Fetch ALL rows by paginating with Range header
async function fetchAll(path, pageSize = 5000) {
  let all = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, hasMore } = await sbPage(path, from, to);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    console.log(`fetchAll ${path.split('?')[0]}: got ${data.length} (total ${all.length}) hasMore=${hasMore}`);
    if (!hasMore) break;
    from += pageSize;
  }
  return all;
}

// Simple fetch (for small tables)
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase GET ${path}: ${res.status} ${err}`);
  }
  return res.json();
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const token = event.headers["x-auth-token"] || "";
  const role = validateToken(token);
  if (!role) return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };

  try {
    // Get uploads metadata
    const uploads = await sbGet("uploads?select=*&order=month_key.asc");
    console.log(`data.js: ${uploads.length} uploads`);

    // Fetch ALL velocity rows with pagination
    const allRows = await fetchAll(
      "velocity_rows?select=upload_id,whs,cust_name,group_name,cust_no,city,st,vendor,itemno,description,pack,size,qty,sales&order=id.asc",
      5000
    );
    console.log(`data.js: ${allRows.length} total rows`);

    // Group rows by upload_id
    const rowsByUpload = {};
    allRows.forEach(r => {
      if (!rowsByUpload[r.upload_id]) rowsByUpload[r.upload_id] = [];
      rowsByUpload[r.upload_id].push({
        whs: r.whs, custName: r.cust_name, groupName: r.group_name,
        custNo: r.cust_no, city: r.city, st: r.st, vendor: r.vendor,
        itemno: r.itemno, description: r.description, pack: r.pack,
        size: r.size, qty: +r.qty, sales: +r.sales,
      });
    });

    // Attach rows to uploads
    const result = uploads.map(u => {
      const rows = rowsByUpload[u.id] || [];
      console.log(`  ${u.distributor} ${u.month_key}: ${rows.length} rows`);
      return {
        id: u.id,
        distributor: u.distributor,
        monthKey: u.month_key,
        month: u.month,
        year: u.year,
        uploadedAt: u.uploaded_at,
        rows,
      };
    });

    // Get log + pricing (small tables, no pagination needed)
    const log = await sbGet("upload_log?select=msg,ok,created_at&order=created_at.desc&limit=50");
    const pricingRows = await sbGet("pricing?select=distributor,itemno,ronnoco_cost,sell_price,fee_flat,fee_pct,description");

    const pricingMap = {};
    if (Array.isArray(pricingRows)) {
      pricingRows.forEach(p => {
        if (!pricingMap[p.distributor]) pricingMap[p.distributor] = {};
        pricingMap[p.distributor][p.itemno] = {
          ronnocoCost: +p.ronnoco_cost||0,
          sellPrice: +p.sell_price, feeFlat: +p.fee_flat,
          feePct: +p.fee_pct, description: p.description,
        };
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploads: result,
        log: Array.isArray(log) ? log.map(l => ({ msg: l.msg, ok: l.ok, at: l.created_at })) : [],
        pricing: pricingMap,
        role,
      }),
    };
  } catch (error) {
    console.error("data.js error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, uploads: [], log: [] }) };
  }
};
