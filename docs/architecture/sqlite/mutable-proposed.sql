-- P0 REVIEW ARTIFACT, not an installed migration or a production database.
-- Read MUTABLE_SQLITE_PERSISTENCE_QUALIFICATION_PLAN.md before implementation.
-- Foreign keys must be enabled on EVERY connection, before any transaction.
PRAGMA foreign_keys = ON;

CREATE TABLE SchemaInfo (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
INSERT INTO SchemaInfo VALUES ('schemaVersion','1'), ('authoredValueEncoding','codex-authored-value-v1');
-- The migration runner will set a persistent vaultGuid, migration checksums and application_id.

-- CANONICAL vault knowledge. Names are not identities and are not globally unique.
CREATE TABLE Actor (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE, typename TEXT NOT NULL,
 name TEXT NOT NULL, attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)), createdUtc TEXT
) STRICT;
CREATE INDEX IX_Actor_TypeName ON Actor(typename);
CREATE INDEX IX_Actor_Name ON Actor(name COLLATE NOCASE);
CREATE TABLE Entity (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE, typename TEXT, name TEXT NOT NULL CHECK(length(trim(name))>0),
 nameKey TEXT NOT NULL, description TEXT, attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 recoveryState TEXT NOT NULL DEFAULT 'authored' CHECK(recoveryState IN ('authored','recovered')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT
) STRICT;
CREATE INDEX IX_Entity_Type ON Entity(typename);
CREATE INDEX IX_Entity_Name ON Entity(nameKey, guid);
CREATE INDEX IX_Entity_Type_Name ON Entity(typename, nameKey, guid);
CREATE TABLE EntityAlias (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid) ON DELETE CASCADE,
 alias TEXT NOT NULL CHECK(length(trim(alias))>0), aliasKey TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin IN ('curated','observed','recovered','imported')),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 UNIQUE(entityGuid,aliasKey)
) STRICT;
CREATE INDEX IX_EntityAlias_Alias ON EntityAlias(aliasKey,entityGuid);
CREATE INDEX IX_EntityAlias_Entity ON EntityAlias(entityGuid);
CREATE TABLE Relationship (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 sourceEntityGuid TEXT NOT NULL REFERENCES Entity(guid) ON DELETE CASCADE,
 typename TEXT NOT NULL,
 targetEntityGuid TEXT NOT NULL REFERENCES Entity(guid) ON DELETE CASCADE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT
) STRICT;
CREATE INDEX IX_Relationship_Source_Type ON Relationship(sourceEntityGuid,typename,targetEntityGuid);
CREATE INDEX IX_Relationship_Target_Type ON Relationship(targetEntityGuid,typename,sourceEntityGuid);
CREATE INDEX IX_Relationship_Type ON Relationship(typename);
CREATE INDEX IX_Relationship_Source_Target ON Relationship(sourceEntityGuid,targetEntityGuid);

-- DERIVED from authoritative saved files. No save/binding/ownership authority.
CREATE TABLE Resource (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE, path TEXT NOT NULL UNIQUE,
 typename TEXT NOT NULL, format TEXT NOT NULL, formatVersion INTEGER,
 rootBlockGuid TEXT NOT NULL, rootPlacementId TEXT,
 title TEXT, fileModifiedUtc TEXT, fileSize INTEGER CHECK(fileSize IS NULL OR fileSize>=0),
 contentHash TEXT NOT NULL, saveGeneration TEXT, indexedUtc TEXT NOT NULL, extractionProfile TEXT NOT NULL,
 indexStatus TEXT NOT NULL CHECK(indexStatus IN ('complete','incomplete','stale','missing','ambiguous','unavailable')),
 diagnostics TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(diagnostics))
) STRICT;
CREATE INDEX IX_Resource_TypeName ON Resource(typename);
CREATE INDEX IX_Resource_Format ON Resource(format);
CREATE TABLE ResourceTag (
 resourceGuid TEXT NOT NULL REFERENCES Resource(guid) ON DELETE CASCADE, tag TEXT NOT NULL,
 PRIMARY KEY(resourceGuid,tag)
) WITHOUT ROWID;
CREATE INDEX IX_ResourceTag_Tag ON ResourceTag(tag,resourceGuid);
-- Inspection failures and duplicate claims cannot be represented as a unique Resource row.
CREATE TABLE IndexIssue (
 path TEXT PRIMARY KEY, claimedResourceGuid TEXT, reason TEXT NOT NULL,
 observedUtc TEXT NOT NULL, details TEXT CHECK(details IS NULL OR json_valid(details))
) STRICT;
CREATE INDEX IX_IndexIssue_Resource ON IndexIssue(claimedResourceGuid);
CREATE TABLE Block (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 resourceGuid TEXT NOT NULL REFERENCES Resource(guid) ON DELETE CASCADE,
 typename TEXT NOT NULL, authoredType TEXT NOT NULL, text TEXT,
 coordinate TEXT CHECK(coordinate IS NULL OR coordinate IN ('cell','utf16')),
 cellCount INTEGER CHECK(cellCount IS NULL OR cellCount>=0),
 explicitlyRetained INTEGER NOT NULL DEFAULT 0 CHECK(explicitlyRetained IN (0,1)),
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 UNIQUE(resourceGuid,guid)
) STRICT;
CREATE INDEX IX_Block_TypeName ON Block(typename);
CREATE TABLE BlockProperty (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 blockGuid TEXT NOT NULL REFERENCES Block(guid) ON DELETE CASCADE,
 authoredId TEXT, identityKind TEXT NOT NULL CHECK(identityKind IN ('authored','derived')),
 ordinal INTEGER NOT NULL CHECK(ordinal>=0), typename TEXT NOT NULL,
 value TEXT, valueJson TEXT CHECK(valueJson IS NULL OR json_valid(valueJson)),
 isDeleted INTEGER NOT NULL DEFAULT 0 CHECK(isDeleted IN (0,1)),
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT
) STRICT;
CREATE INDEX IX_BlockProperty_Block_Type ON BlockProperty(blockGuid,typename);
CREATE INDEX IX_BlockProperty_Type_Value ON BlockProperty(typename,value);
CREATE TABLE BlockRelation (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 resourceGuid TEXT NOT NULL, sourceBlockGuid TEXT NOT NULL,
 authoredId TEXT, identityKind TEXT NOT NULL CHECK(identityKind IN ('authored','derived')),
 typename TEXT NOT NULL, targetBlockGuid TEXT NOT NULL,
 targetResourceGuid TEXT,
 targetScope TEXT NOT NULL CHECK(targetScope IN ('local','document','workspace','unknown')),
 kind TEXT NOT NULL CHECK(kind IN ('owned','reference','presentation')),
 slot TEXT, ordinal INTEGER CHECK(ordinal IS NULL OR ordinal>=0), topology TEXT,
 targetDescriptor TEXT CHECK(targetDescriptor IS NULL OR json_valid(targetDescriptor)),
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 FOREIGN KEY(resourceGuid,sourceBlockGuid) REFERENCES Block(resourceGuid,guid) ON DELETE CASCADE
 -- No target FK: an external/missing target does not erase its authored incoming edge.
) STRICT;
CREATE INDEX IX_BlockRelation_Resource ON BlockRelation(resourceGuid);
CREATE INDEX IX_BlockRelation_Source_Type_Ordinal ON BlockRelation(sourceBlockGuid,typename,ordinal);
CREATE INDEX IX_BlockRelation_Target_Type ON BlockRelation(targetBlockGuid,typename);
CREATE INDEX IX_BlockRelation_Type ON BlockRelation(typename);
CREATE INDEX IX_BlockRelation_TargetResource ON BlockRelation(targetResourceGuid);
CREATE TABLE AnnotationDefinition (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 resourceGuid TEXT NOT NULL, ownerBlockGuid TEXT NOT NULL, annotationId TEXT NOT NULL,
 typename TEXT, value TEXT, valueJson TEXT CHECK(valueJson IS NULL OR json_valid(valueJson)),
 isDeleted INTEGER NOT NULL DEFAULT 0 CHECK(isDeleted IN (0,1)),
 attributes TEXT NOT NULL CHECK(json_valid(attributes)),
 UNIQUE(resourceGuid,ownerBlockGuid,annotationId),
 FOREIGN KEY(resourceGuid,ownerBlockGuid) REFERENCES Block(resourceGuid,guid) ON DELETE CASCADE
) STRICT;
CREATE TABLE StandoffProperty (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 resourceGuid TEXT NOT NULL, sourceBlockGuid TEXT NOT NULL,
 authoredId TEXT, identityKind TEXT NOT NULL CHECK(identityKind IN ('authored','derived')),
 logicalGuid TEXT NOT NULL,
 typename TEXT, startIndex INTEGER NOT NULL CHECK(startIndex>=0), endIndex INTEGER NOT NULL CHECK(endIndex>=startIndex),
 coordinate TEXT NOT NULL CHECK(coordinate IN ('cell','utf16')),
 text TEXT, value TEXT, valueJson TEXT CHECK(valueJson IS NULL OR json_valid(valueJson)),
 targetEntityGuid TEXT, targetBlockGuid TEXT, targetResourceGuid TEXT,
 definitionResourceGuid TEXT, definitionBlockGuid TEXT, definitionAnnotationId TEXT,
 definitionHash TEXT, definitionTarget TEXT CHECK(definitionTarget IS NULL OR json_valid(definitionTarget)),
 resolution TEXT NOT NULL CHECK(resolution IN ('direct','resolved','unresolved')),
 isDeleted INTEGER NOT NULL DEFAULT 0 CHECK(isDeleted IN (0,1)), topology TEXT,
 attributes TEXT NOT NULL CHECK(json_valid(attributes)),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 FOREIGN KEY(resourceGuid,sourceBlockGuid) REFERENCES Block(resourceGuid,guid) ON DELETE CASCADE
 -- Target IDs are file assertions, not promises that referenced knowledge is available.
) STRICT;
CREATE INDEX IX_Standoff_Resource ON StandoffProperty(resourceGuid);
CREATE INDEX IX_Standoff_Type ON StandoffProperty(typename);
CREATE INDEX IX_Standoff_Block_Range ON StandoffProperty(sourceBlockGuid,startIndex,endIndex);
CREATE INDEX IX_Standoff_Block_Type_Range ON StandoffProperty(sourceBlockGuid,typename,startIndex,endIndex);
CREATE INDEX IX_Standoff_Entity_Type ON StandoffProperty(targetEntityGuid,typename);
CREATE INDEX IX_Standoff_Document ON StandoffProperty(targetResourceGuid,targetBlockGuid,typename);
CREATE INDEX IX_Standoff_Logical ON StandoffProperty(logicalGuid);
CREATE INDEX IX_Standoff_Definition ON StandoffProperty(definitionResourceGuid,definitionBlockGuid,definitionAnnotationId);
-- Refuse deletion against known saved references; the API additionally reports coverage limits.
CREATE TRIGGER Entity_referenced BEFORE DELETE ON Entity
WHEN EXISTS(SELECT 1 FROM StandoffProperty WHERE targetEntityGuid=old.guid AND isDeleted=0)
BEGIN SELECT RAISE(ABORT,'Entity has saved references'); END;

-- Text runs preserve native inline-object boundaries. FTS hits are candidates, not editor offsets.
CREATE TABLE BlockTextRun (
 id INTEGER PRIMARY KEY, blockGuid TEXT NOT NULL REFERENCES Block(guid) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL CHECK(ordinal>=0), text TEXT NOT NULL,
 boundaries TEXT CHECK(boundaries IS NULL OR json_valid(boundaries)), UNIQUE(blockGuid,ordinal)
) STRICT;
CREATE VIRTUAL TABLE BlockSearch USING fts5(text, content='BlockTextRun', content_rowid='id', tokenize='unicode61');
CREATE TRIGGER BlockTextRun_ai AFTER INSERT ON BlockTextRun BEGIN
 INSERT INTO BlockSearch(rowid,text) VALUES(new.id,new.text); END;
CREATE TRIGGER BlockTextRun_ad AFTER DELETE ON BlockTextRun BEGIN
 INSERT INTO BlockSearch(BlockSearch,rowid,text) VALUES('delete',old.id,old.text); END;
CREATE TRIGGER BlockTextRun_au AFTER UPDATE OF text ON BlockTextRun BEGIN
 INSERT INTO BlockSearch(BlockSearch,rowid,text) VALUES('delete',old.id,old.text);
 INSERT INTO BlockSearch(rowid,text) VALUES(new.id,new.text); END;
CREATE VIRTUAL TABLE EntitySearch USING fts5(name,description,content='Entity',content_rowid='id',tokenize='unicode61',prefix='2 3');
CREATE TRIGGER Entity_ai AFTER INSERT ON Entity BEGIN
 INSERT INTO EntitySearch(rowid,name,description) VALUES(new.id,new.name,new.description); END;
CREATE TRIGGER Entity_ad AFTER DELETE ON Entity BEGIN
 INSERT INTO EntitySearch(EntitySearch,rowid,name,description) VALUES('delete',old.id,old.name,old.description); END;
CREATE TRIGGER Entity_au AFTER UPDATE OF name,description ON Entity BEGIN
 INSERT INTO EntitySearch(EntitySearch,rowid,name,description) VALUES('delete',old.id,old.name,old.description);
 INSERT INTO EntitySearch(rowid,name,description) VALUES(new.id,new.name,new.description); END;
CREATE VIRTUAL TABLE EntityAliasSearch USING fts5(alias,content='EntityAlias',content_rowid='id',tokenize='unicode61',prefix='2 3');
CREATE TRIGGER EntityAlias_ai AFTER INSERT ON EntityAlias BEGIN
 INSERT INTO EntityAliasSearch(rowid,alias) VALUES(new.id,new.alias); END;
CREATE TRIGGER EntityAlias_ad AFTER DELETE ON EntityAlias BEGIN
 INSERT INTO EntityAliasSearch(EntityAliasSearch,rowid,alias) VALUES('delete',old.id,old.alias); END;
CREATE TRIGGER EntityAlias_au AFTER UPDATE OF alias ON EntityAlias BEGIN
 INSERT INTO EntityAliasSearch(EntityAliasSearch,rowid,alias) VALUES('delete',old.id,old.alias);
 INSERT INTO EntityAliasSearch(rowid,alias) VALUES(new.id,new.alias); END;

-- Operational delivery state only: remove after audit acknowledgement. Never needed for reads.
CREATE TABLE PendingAuditMutation (
 guid TEXT PRIMARY KEY, timestampUtc TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
