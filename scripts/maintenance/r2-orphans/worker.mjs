// GET  /        -> lists every object in the bucket and whether the database
//                  references its key (files.object_key or dataset_versions.object_key)
// POST /delete  -> deletes the unreferenced objects listed by GET (body: {"confirm":"delete-orphans"})
//
// Run: npx wrangler dev --remote --config scripts/maintenance/r2-orphans/wrangler.jsonc
async function referencedKeys(env) {
  const { results } = await env.DB.prepare(
    "SELECT object_key FROM files UNION SELECT object_key FROM dataset_versions"
  ).all();
  return new Set(results.map((row) => row.object_key));
}

async function listAll(env) {
  const objects = [];
  let cursor;
  do {
    const page = await env.FILES.list({ cursor, limit: 1000 });
    objects.push(...page.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

export default {
  async fetch(request, env) {
    const referenced = await referencedKeys(env);
    const objects = await listAll(env);
    const orphans = objects.filter((o) => !referenced.has(o.key));

    if (request.method === "POST" && new URL(request.url).pathname === "/delete") {
      const body = await request.json().catch(() => ({}));
      if (body.confirm !== "delete-orphans") {
        return Response.json({ error: "confirmation required" }, { status: 400 });
      }
      if (orphans.length > 0) await env.FILES.delete(orphans.map((o) => o.key));
      return Response.json({ deleted: orphans.map((o) => o.key) });
    }

    return Response.json({
      bucketObjects: objects.length,
      referencedKeys: referenced.size,
      orphans
    });
  }
};
