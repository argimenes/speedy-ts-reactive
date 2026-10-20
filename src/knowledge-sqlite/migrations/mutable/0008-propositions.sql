-- The runner disables FKs BEFORE the transaction and checks every FK before commit.
DROP TRIGGER Entity_referenced;
CREATE TABLE Block_v8 (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 resourceGuid TEXT REFERENCES Resource(guid) ON DELETE CASCADE,
 entityGuid TEXT REFERENCES Entity(guid) ON DELETE RESTRICT,
 typename TEXT NOT NULL, authoredType TEXT NOT NULL, text TEXT,
 coordinate TEXT CHECK(coordinate IS NULL OR coordinate IN ('cell','utf16')),
 cellCount INTEGER CHECK(cellCount IS NULL OR cellCount>=0),
 explicitlyRetained INTEGER NOT NULL DEFAULT 0 CHECK(explicitlyRetained IN (0,1)),
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 CHECK(resourceGuid IS NOT NULL OR (typename='mutable/proposition-block' AND authoredType='mutable/proposition-block' AND entityGuid IS NOT NULL AND text IS NOT NULL)),
 UNIQUE(resourceGuid,guid)
) STRICT;
INSERT INTO Block_v8(id,guid,resourceGuid,typename,authoredType,text,coordinate,cellCount,explicitlyRetained,attributes,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc) SELECT id,guid,resourceGuid,typename,authoredType,text,coordinate,cellCount,explicitlyRetained,attributes,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc FROM Block;
DROP TABLE Block;
ALTER TABLE Block_v8 RENAME TO Block;
CREATE INDEX IX_Block_TypeName ON Block(typename);
CREATE TABLE StandoffProperty_v8 (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 resourceGuid TEXT, sourceBlockGuid TEXT NOT NULL REFERENCES Block(guid) ON DELETE CASCADE,
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
 CHECK(resourceGuid IS NOT NULL OR (resolution='direct' AND definitionResourceGuid IS NULL AND definitionBlockGuid IS NULL AND definitionAnnotationId IS NULL AND definitionHash IS NULL AND definitionTarget IS NULL)),
 FOREIGN KEY(resourceGuid,sourceBlockGuid) REFERENCES Block(resourceGuid,guid) ON DELETE CASCADE
 -- Target IDs are file assertions, not promises that referenced knowledge is available.
) STRICT;
INSERT INTO StandoffProperty_v8 SELECT * FROM StandoffProperty;
DROP TABLE StandoffProperty;
ALTER TABLE StandoffProperty_v8 RENAME TO StandoffProperty;
CREATE INDEX IX_Standoff_Resource ON StandoffProperty(resourceGuid);
CREATE INDEX IX_Standoff_Type ON StandoffProperty(typename);
CREATE INDEX IX_Standoff_Block_Range ON StandoffProperty(sourceBlockGuid,startIndex,endIndex);
CREATE INDEX IX_Standoff_Block_Type_Range ON StandoffProperty(sourceBlockGuid,typename,startIndex,endIndex);
CREATE INDEX IX_Standoff_Entity_Type ON StandoffProperty(targetEntityGuid,typename);
CREATE INDEX IX_Standoff_Document ON StandoffProperty(targetResourceGuid,targetBlockGuid,typename);
CREATE INDEX IX_Standoff_Logical ON StandoffProperty(logicalGuid);
CREATE INDEX IX_Standoff_Definition ON StandoffProperty(definitionResourceGuid,definitionBlockGuid,definitionAnnotationId);
CREATE TRIGGER Entity_referenced BEFORE DELETE ON Entity
WHEN EXISTS(SELECT 1 FROM StandoffProperty WHERE targetEntityGuid=old.guid AND isDeleted=0)
BEGIN SELECT RAISE(ABORT,'Entity has saved references'); END;


CREATE UNIQUE INDEX UX_Block_PropositionEntity ON Block(entityGuid)
 WHERE resourceGuid IS NULL AND typename='mutable/proposition-block' AND entityGuid IS NOT NULL;
CREATE TRIGGER Standoff_owner_insert BEFORE INSERT ON StandoffProperty
WHEN NOT EXISTS(SELECT 1 FROM Block WHERE guid=new.sourceBlockGuid AND resourceGuid IS new.resourceGuid)
BEGIN SELECT RAISE(ABORT,'Standoff ownership mismatch'); END;
CREATE TRIGGER Standoff_owner_update BEFORE UPDATE OF resourceGuid,sourceBlockGuid ON StandoffProperty
WHEN NOT EXISTS(SELECT 1 FROM Block WHERE guid=new.sourceBlockGuid AND resourceGuid IS new.resourceGuid)
BEGIN SELECT RAISE(ABORT,'Standoff ownership mismatch'); END;
CREATE TRIGGER Block_owner_update BEFORE UPDATE OF resourceGuid ON Block
WHEN old.resourceGuid IS NOT new.resourceGuid
BEGIN SELECT RAISE(ABORT,'Block ownership is immutable'); END;
CREATE TRIGGER Proposition_entity_insert BEFORE INSERT ON Block
WHEN new.resourceGuid IS NULL AND NOT EXISTS(SELECT 1 FROM Entity WHERE guid=new.entityGuid AND typename='Proposition')
BEGIN SELECT RAISE(ABORT,'Proposition Entity required'); END;
CREATE TRIGGER Proposition_entity_update BEFORE UPDATE OF entityGuid,typename,authoredType ON Block
WHEN new.resourceGuid IS NULL AND NOT EXISTS(SELECT 1 FROM Entity WHERE guid=new.entityGuid AND typename='Proposition')
BEGIN SELECT RAISE(ABORT,'Proposition Entity required'); END;
CREATE TRIGGER Proposition_type_update BEFORE UPDATE OF typename ON Entity
WHEN new.typename IS NOT 'Proposition' AND EXISTS(SELECT 1 FROM Block WHERE entityGuid=old.guid AND resourceGuid IS NULL)
BEGIN SELECT RAISE(ABORT,'Bound Proposition type is immutable'); END;
