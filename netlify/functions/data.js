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
    const store = getStore({ name: "velocity-data", consistency: "strong" });
    const { blobs } = await store.list();

    const uploads = [];
    let log = [];

    for (const blob of blobs) {
      if (blob.key === "__log__") continue;
      try {
        const data = await store.get(blob.key, { type: "json" });
        if (data) uploads.push(data);
      } catch (e) {
        // skip corrupt blobs
      }
    }

    try {
      const logData = await store.get("__log__", { type: "json" });
      if (logData) log = logData;
    } catch (e) {}

    // Sort uploads by monthKey
    uploads.sort((a, b) => (a.monthKey || "").localeCompare(b.monthKey || ""));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ uploads, log }),
    };
  } catch (error) {
    console.error("data.js error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, uploads: [], log: [] }),
    };
  }
};
