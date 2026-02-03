export async function onRequestPost(context) {
  try {
    const { MY_KV } = context.env;
    const { id, data } = await context.request.json();
    await MY_KV.put(id, JSON.stringify(data));
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
