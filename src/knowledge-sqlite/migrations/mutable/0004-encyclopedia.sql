-- Rebuild the small identity tables to broaden namespaces without altering old captures.
CREATE TABLE SnapshotMigration AS SELECT * FROM SourceSnapshot;
DROP TABLE SourceSnapshot;
CREATE TABLE IdentityMigration AS SELECT * FROM ExternalIdentity;
DROP TABLE ExternalIdentity;
CREATE TABLE ExternalIdentity (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid), resourceGuid TEXT NOT NULL UNIQUE,
 namespace TEXT NOT NULL CHECK(namespace IN ('doi','wikipedia','wikidata')), externalKey TEXT NOT NULL,
 attributes TEXT NOT NULL CHECK(json_valid(attributes)), UNIQUE(namespace,externalKey)
) STRICT;
INSERT INTO ExternalIdentity SELECT * FROM IdentityMigration;
DROP TABLE IdentityMigration;
CREATE INDEX IX_ExternalIdentity_Entity ON ExternalIdentity(entityGuid);
CREATE TABLE SourceSnapshot (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 identityGuid TEXT NOT NULL REFERENCES ExternalIdentity(guid),
 attributes TEXT NOT NULL CHECK(json_valid(attributes)), captureKey TEXT,
 UNIQUE(identityGuid,captureKey)
) STRICT;
INSERT INTO SourceSnapshot(id,guid,identityGuid,attributes) SELECT id,guid,identityGuid,attributes FROM SnapshotMigration;
DROP TABLE SnapshotMigration;
CREATE INDEX IX_SourceSnapshot_Identity ON SourceSnapshot(identityGuid,id);
CREATE TABLE SourceClaimReview (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 snapshotGuid TEXT NOT NULL REFERENCES SourceSnapshot(guid), statementId TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected')),
 claimGuid TEXT REFERENCES Claim(guid), attributes TEXT NOT NULL CHECK(json_valid(attributes)),
 UNIQUE(snapshotGuid,statementId)
) STRICT;
CREATE INDEX IX_SourceClaimReview_Claim ON SourceClaimReview(claimGuid);
