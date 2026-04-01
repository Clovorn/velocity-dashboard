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

    // Delete everything
    if (body.deleteAll) {
      const { blobs } = await store.list();
      await Promise.all(blobs.map((b) => store.delete(b.key)));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, deleted: blobs.length }),
      };
    }

    // Delete a specific month (all blobs whose key starts with monthKey)
    if (body.monthKey) {
      const { blobs } = await store.list();
      const toDelete = blobs.filter(
        (b) => b.key !== "__log__" && b.key.startsWith(body.monthKey)
      );
      await Promise.all(toDelete.map((b) => store.delete(b.key)));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, deleted: toDelete.length }),
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Provide monthKey or deleteAll:true" }),
    };
  } catch (error) {
    console.error("delete.js error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
