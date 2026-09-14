import { Router } from "express";
import { RecordId } from "surrealdb";
interface SearchDatabase { query(sql: string, variables?: Record<string, unknown>): Promise<unknown> }
export function createEntitySearchRouter(database: () => SearchDatabase | undefined) {
  const router = Router();
  for (const alias of [false, true]) router.get(alias ? "/findAgentsByAliasJson" : "/findAgentsByNameJson", async (req, res) => {
    const search = req.query.search, pageValue = Number(req.query.page ?? 1);
    if (typeof search !== "string" || search.length > 1000 || !Number.isSafeInteger(pageValue) || pageValue < 1) {
      res.status(400).json({ Success: false, Error: "Supply search text (up to 1000 characters) and a positive page number." }); return;
    }
    const empty = { Success: true, Count: 0, Page: 1, MaxPage: 1, Rows: 10, Results: [] };
    if (!search.trim()) { res.json(empty); return; }
    const db = database();
    if (!db) { res.status(503).json({ Success: false, Error: "Entity search requires the Node server's SurrealDB connection." }); return; }
    const match = req.query.byPartial === "true" ? "CONTAINS" : "=";
    const direction = req.query.direction === "Ascending" ? "ASC" : "DESC";
    const order = req.query.order === "ByName" ? "name" : alias && req.query.order === "ByText" ? "text" : "mentions";
    const query = alias
      ? `SELECT text, mentions, agent.id AS id, agent.name AS name FROM (SELECT in.text AS text, out AS agent, count() AS mentions FROM standoff_property_refers_to_agent WHERE in.text ${match} $text GROUP BY text, agent)`
      : `SELECT id, name, count(<-standoff_property_refers_to_agent<-StandoffProperty) AS mentions FROM Agent WHERE name ${match} $text`;
    try {
      const counts = await db.query(`SELECT count() AS total FROM (${query}) GROUP ALL`, { text: search }) as Array<Array<{ total: number }>>;
      const count = Number(counts[0]?.[0]?.total ?? 0);
      if (!count) { res.json(empty); return; }
      const maxPage = Math.ceil(count / 10), page = Math.min(pageValue, maxPage);
      const data = await db.query(`${query} ORDER BY ${order} ${direction}, id ASC LIMIT $rows START $start`, { text: search, rows: 10, start: (page - 1) * 10 }) as Array<Array<{ id: unknown; name: string; text?: string; mentions?: number }>>;
      // Document indexing wraps annotation values in new RecordId("Agent", value).
      // Return the record key, not "Agent:key", to avoid double-prefixed references.
      res.json({ Success: true, Count: count, Page: page, MaxPage: maxPage, Rows: 10, Results: (data[0] ?? []).map(row => ({ ...row, id: row.id instanceof RecordId ? String(row.id.id) : String(row.id) })) });
    } catch (error) {
      console.error("Entity search query failed", error);
      res.status(503).json({ Success: false, Error: "Entity search is unavailable. Check the Node server and SurrealDB connection." });
    }
  });
  router.post("/entities/summary", async (req, res) => {
    const input = req.body?.ids;
    if (!Array.isArray(input) || input.length > 5000 || input.some(id => typeof id !== "string" || !id.trim() || id.length > 500)) {
      res.status(400).json({ Success: false, Error: "Supply an array of up to 5,000 non-empty entity IDs." }); return;
    }
    const ids = [...new Set(input as string[])];
    if (!ids.length) { res.json({ Success: true, Results: [] }); return; }
    const db = database();
    if (!db) { res.status(503).json({ Success: false, Error: "Entity summaries require the Node server's SurrealDB connection." }); return; }
    try {
      const data = await db.query("SELECT id, name, count(<-standoff_property_refers_to_agent<-StandoffProperty) AS mentions FROM Agent WHERE id IN $ids", { ids: ids.map(id => new RecordId("Agent", id)) }) as Array<Array<{ id: unknown; name: string; mentions?: number }>>;
      res.json({ Success: true, Results: (data[0] ?? []).map(row => ({ id: row.id instanceof RecordId ? String(row.id.id) : String(row.id), name: row.name, mentions: Number(row.mentions ?? 0) })) });
    } catch (error) {
      console.error("Entity summary query failed", error);
      res.status(503).json({ Success: false, Error: "Entity summaries are unavailable. Check the Node server and SurrealDB connection." });
    }
  });
  return router;
}
