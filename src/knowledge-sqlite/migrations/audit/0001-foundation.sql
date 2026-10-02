CREATE TABLE SchemaInfo(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
INSERT INTO SchemaInfo VALUES ('schemaVersion','1'), ('authoredValueEncoding','codex-authored-value-v1');
CREATE TABLE AuditMutation (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE, actorGuid TEXT,
 timestampUtc TEXT NOT NULL, attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes))
) STRICT;
CREATE TABLE AuditEvent (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 mutationGuid TEXT REFERENCES AuditMutation(guid) ON DELETE CASCADE,
 actorGuid TEXT, operation TEXT NOT NULL, recordType TEXT NOT NULL, recordGuid TEXT NOT NULL,
 timestampUtc TEXT NOT NULL,
 beforeJson TEXT CHECK(beforeJson IS NULL OR json_valid(beforeJson)),
 afterJson TEXT CHECK(afterJson IS NULL OR json_valid(afterJson))
) STRICT;
CREATE INDEX IX_AuditEvent_Record_Time ON AuditEvent(recordType,recordGuid,timestampUtc);
CREATE INDEX IX_AuditEvent_Actor_Time ON AuditEvent(actorGuid,timestampUtc);
CREATE INDEX IX_AuditEvent_Mutation ON AuditEvent(mutationGuid);
CREATE INDEX IX_AuditEvent_Time ON AuditEvent(timestampUtc);
