export async function onRequestGet(context) {
  try {
    const { MY_KV } = context.env;
    const { searchParams } = new URL(context.request.url);
    const id = searchParams.get('id');
    const data = await MY_KV.get(id);
    return new Response(data || "[]", {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response("[]", { status: 200 });
  }
}
