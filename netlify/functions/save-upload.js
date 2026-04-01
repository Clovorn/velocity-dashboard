const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body);
    const store = getStore({ name: "velocity-data", consistency: "strong" });

    // Handle log-only update
    if (body._logUpdate) {
      await store.setJSON("__log__", body.log || []);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // Validate required fields
    if (!body.monthKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "monthKey is required" }),
      };
    }

    // Key: monthKey + distributor so multiple distributors can coexist per month
    const safeDist = (body.distributor || "default")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    const key = `${body.monthKey}_${safeDist}`;

    await store.setJSON(key, body);

    // Also update the log
    if (body._log) {
      try {
        await store.setJSON("__log__", body._log);
      } catch (e) {}
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, key }),
    };
  } catch (error) {
    console.error("save-upload.js error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
