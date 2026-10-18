-- Extend immutable external resource identities without changing A/B captures.
CREATE TABLE IIIFReviewBackup AS SELECT * FROM SourceClaimReview;
DROP TABLE SourceClaimReview;
CREATE TABLE IIIFSnapshotBackup AS SELECT * FROM SourceSnapshot;
DROP TABLE SourceSnapshot;
CREATE TABLE IIIFIdentityBackup AS SELECT * FROM ExternalIdentity;
DROP TABLE ExternalIdentity;
CREATE TABLE ExternalIdentity (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid), resourceGuid TEXT NOT NULL UNIQUE,
 namespace TEXT NOT NULL CHECK(namespace IN ('doi','wikipedia','wikidata','iiif')), externalKey TEXT NOT NULL,
 attributes TEXT NOT NULL CHECK(json_valid(attributes)), UNIQUE(namespace,externalKey)
) STRICT;
INSERT INTO ExternalIdentity SELECT * FROM IIIFIdentityBackup;
DROP TABLE IIIFIdentityBackup;
CREATE INDEX IX_ExternalIdentity_Entity ON ExternalIdentity(entityGuid);
CREATE TABLE SourceSnapshot (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 identityGuid TEXT NOT NULL REFERENCES ExternalIdentity(guid),
 attributes TEXT NOT NULL CHECK(json_valid(attributes)), captureKey TEXT,
 UNIQUE(identityGuid,captureKey)
) STRICT;
INSERT INTO SourceSnapshot SELECT * FROM IIIFSnapshotBackup;
DROP TABLE IIIFSnapshotBackup;
CREATE INDEX IX_SourceSnapshot_Identity ON SourceSnapshot(identityGuid,id);
CREATE INDEX IX_SourceSnapshot_IIIFParent ON SourceSnapshot(json_extract(attributes,'$.parentSnapshotId'),json_extract(attributes,'$.canvasId'),json_extract(attributes,'$.kind'));
CREATE TABLE SourceClaimReview (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 snapshotGuid TEXT NOT NULL REFERENCES SourceSnapshot(guid), statementId TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected')),
 claimGuid TEXT REFERENCES Claim(guid), attributes TEXT NOT NULL CHECK(json_valid(attributes)),
 UNIQUE(snapshotGuid,statementId)
) STRICT;
INSERT INTO SourceClaimReview SELECT * FROM IIIFReviewBackup;
DROP TABLE IIIFReviewBackup;
CREATE INDEX IX_SourceClaimReview_Claim ON SourceClaimReview(claimGuid);
