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

async function sbFetch(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation,resolution=merge-duplicates",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
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

    // ── Save pricing ──────────────────────────────────────────────
    if (body._pricingUpdate) {
      const { distributor, pricing } = body;
      const rows = Object.entries(pricing).map(([itemno, p]) => ({
        distributor,
        itemno,
        description: p.description || "",
        ronnoco_cost: p.ronnocoCost || 0,
        sell_price: p.sellPrice || 0,
        fee_flat: p.feeFlat || 0,
        fee_pct: p.feePct || 0,
      }));
      if (rows.length) {
        await sbFetch("pricing?on_conflict=distributor,itemno", "POST", rows);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // ── Save velocity upload ──────────────────────────────────────
    const rawDist = body.distributor || '';
    const distributor = rawDist.trim().split(' ').map(w=>w?w.charAt(0).toUpperCase()+w.slice(1).toLowerCase():'').join(' ');
    const { monthKey, month, year, rows, uploadedAt } = body;
    if (!distributor || !monthKey || !rows) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "distributor, monthKey, rows required" }) };
    }

    // Upsert the upload record
    const uploadRes = await sbFetch("uploads?on_conflict=distributor,month_key", "POST", [{
      distributor,
      month_key: monthKey,
      month,
      year,
      row_count: rows.length,
      total_cases: rows.reduce((s, r) => s + (+r.qty || 0), 0),
      total_sales: Math.round(rows.reduce((s, r) => s + (+r.sales || 0), 0) * 100) / 100,
      total_custs: new Set(rows.map(r => r.custName)).size,
      total_skus:  new Set(rows.map(r => r.itemno)).size,
      uploaded_at: uploadedAt || new Date().toISOString(),
    }]);

    const uploadId = uploadRes[0]?.id;
    if (!uploadId) throw new Error("Failed to get upload ID");

    // Delete existing rows for this upload (in case of re-upload)
    await sbFetch(`velocity_rows?upload_id=eq.${uploadId}`, "DELETE");

    // Insert rows in batches of 500 to avoid request size limits
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH).map(r => ({
        upload_id:   uploadId,
        distributor,
        month_key:   monthKey,
        month,
        year,
        whs:         String(r.whs         || "").trim(),
        cust_name:   String(r.custName    || "").trim(),
        group_name:  String(r.groupName   || "").trim(),
        cust_no:     String(r.custNo      || "").trim(),
        city:        String(r.city        || "").trim(),
        st:          String(r.st          || "").trim(),
        vendor:      String(r.vendor      || ""),
        itemno:      String(r.itemno      || "").trim(),
        description: String(r.description || "").trim(),
        pack:        String(r.pack        || ""),
        size:        String(r.size        || "").trim(),
        qty:         +r.qty   || 0,
        sales:       +r.sales || 0,
      }));
      await sbFetch("velocity_rows", "POST", batch);
    }

    // Log the upload
    await sbFetch("upload_log", "POST", [{
      msg: `${distributor} · ${monthKey} — ${rows.length} rows`,
      ok: true,
    }]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, uploadId, rowCount: rows.length }),
    };
  } catch (error) {
    console.error("save-upload error:", error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
