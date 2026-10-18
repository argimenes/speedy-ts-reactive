-- Canonical scholarly identities/captures. Derived document references use BlockProperty.
CREATE TABLE ExternalIdentity (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid), resourceGuid TEXT NOT NULL UNIQUE,
 namespace TEXT NOT NULL CHECK(namespace='doi'), externalKey TEXT NOT NULL,
 attributes TEXT NOT NULL CHECK(json_valid(attributes)), UNIQUE(namespace,externalKey)
) STRICT;
CREATE INDEX IX_ExternalIdentity_Entity ON ExternalIdentity(entityGuid);
CREATE TABLE SourceSnapshot (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 identityGuid TEXT NOT NULL REFERENCES ExternalIdentity(guid),
 attributes TEXT NOT NULL CHECK(json_valid(attributes))
) STRICT;
CREATE INDEX IX_SourceSnapshot_Identity ON SourceSnapshot(identityGuid,id);
CREATE INDEX IX_BlockProperty_EntityReference ON BlockProperty(value,blockGuid) WHERE typename='codex/entity-reference' AND isDeleted=0;
