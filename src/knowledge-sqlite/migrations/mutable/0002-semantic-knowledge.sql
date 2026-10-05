-- Additive canonical semantic structures; file-derived tables remain rebuildable.

CREATE TABLE Time (
 id INTEGER PRIMARY KEY, 
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 entityGuid TEXT NOT NULL UNIQUE REFERENCES Entity(guid) ON DELETE CASCADE, expression TEXT,
 startYear INTEGER,
 startMonth INTEGER,
 startDay INTEGER,
 startHour INTEGER,
 startMinute INTEGER,
 startSecond INTEGER,
 endYear INTEGER,
 endMonth INTEGER,
 endDay INTEGER,
 endHour INTEGER,
 endMinute INTEGER,
 endSecond INTEGER,
 precision TEXT, approximation TEXT, certainty TEXT, extentKind TEXT, qualifier TEXT,
 normalizationProfile TEXT, lowerBoundDay INTEGER, upperBoundDayExclusive INTEGER,
 CHECK((lowerBoundDay IS NULL AND upperBoundDayExclusive IS NULL) OR
 (lowerBoundDay IS NOT NULL AND upperBoundDayExclusive IS NOT NULL AND normalizationProfile IS NOT NULL AND upperBoundDayExclusive>lowerBoundDay))
) STRICT;
CREATE INDEX IX_Time_Bounds ON Time(normalizationProfile,lowerBoundDay,upperBoundDayExclusive);
CREATE INDEX IX_Time_Components ON Time(startYear,startMonth,startDay,entityGuid);

CREATE TABLE Claim (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 expression TEXT, typename TEXT
) STRICT;
CREATE INDEX IX_Claim_Kind ON Claim(typename,guid);

CREATE TABLE ClaimParticipant (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 claimGuid TEXT NOT NULL REFERENCES Claim(guid) ON DELETE CASCADE,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid) ON DELETE NO ACTION,
 role TEXT, ordinal INTEGER NOT NULL CHECK(ordinal>=0), UNIQUE(claimGuid,ordinal)
) STRICT;
CREATE INDEX IX_ClaimParticipant_Order ON ClaimParticipant(claimGuid,ordinal);
CREATE INDEX IX_ClaimParticipant_Entity ON ClaimParticipant(entityGuid,role,claimGuid);
CREATE INDEX IX_ClaimParticipant_Role ON ClaimParticipant(role,entityGuid,claimGuid);

CREATE TABLE ClaimQualifier (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 claimGuid TEXT NOT NULL REFERENCES Claim(guid) ON DELETE CASCADE,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid) ON DELETE NO ACTION,
 role TEXT NOT NULL CHECK(length(trim(role))>0), ordinal INTEGER NOT NULL CHECK(ordinal>=0), UNIQUE(claimGuid,ordinal)
) STRICT;
CREATE INDEX IX_ClaimQualifier_Order ON ClaimQualifier(claimGuid,role,ordinal);
CREATE INDEX IX_ClaimQualifier_Entity ON ClaimQualifier(entityGuid,role,claimGuid);

CREATE TABLE ClaimEvidence (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 claimGuid TEXT NOT NULL REFERENCES Claim(guid) ON DELETE CASCADE,
 resourceGuid TEXT NOT NULL, blockGuid TEXT NOT NULL, authoredPropertyId TEXT,
 sourceContentHash TEXT NOT NULL, startIndex INTEGER NOT NULL CHECK(startIndex>=0),
 endIndex INTEGER NOT NULL CHECK(endIndex>=startIndex), coordinate TEXT NOT NULL CHECK(coordinate IN ('cell','utf16')),
 evidenceKind TEXT NOT NULL, excerpt TEXT
) STRICT;
CREATE INDEX IX_ClaimEvidence_Claim ON ClaimEvidence(claimGuid,guid);
CREATE INDEX IX_ClaimEvidence_Source ON ClaimEvidence(resourceGuid,blockGuid,authoredPropertyId);
CREATE INDEX IX_ClaimEvidence_Generation ON ClaimEvidence(resourceGuid,sourceContentHash);

CREATE TABLE DataSet (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 name TEXT
) STRICT;
CREATE INDEX IX_DataSet_Name ON DataSet(name,guid);

CREATE TABLE DataPoint (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 name TEXT, valueJson TEXT NOT NULL CHECK(json_valid(valueJson)), valueType TEXT NOT NULL,
 normalizedNumber REAL, normalizationProfile TEXT,
 CHECK(normalizedNumber IS NULL OR normalizationProfile IS NOT NULL)
) STRICT;
CREATE INDEX IX_DataPoint_Number ON DataPoint(normalizationProfile,normalizedNumber,guid);

CREATE TABLE DataPointDimension (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 dataPointGuid TEXT NOT NULL REFERENCES DataPoint(guid) ON DELETE CASCADE,
 entityGuid TEXT NOT NULL REFERENCES Entity(guid) ON DELETE NO ACTION,
 role TEXT NOT NULL CHECK(length(trim(role))>0), ordinal INTEGER NOT NULL CHECK(ordinal>=0), UNIQUE(dataPointGuid,ordinal)
) STRICT;
CREATE INDEX IX_DataPointDimension_Order ON DataPointDimension(dataPointGuid,role,ordinal);
CREATE INDEX IX_DataPointDimension_Entity ON DataPointDimension(role,entityGuid,dataPointGuid);

CREATE TABLE DataSetMembership (
 id INTEGER PRIMARY KEY, guid TEXT NOT NULL UNIQUE,
 attributes TEXT CHECK(attributes IS NULL OR json_valid(attributes)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 createdByActorGuid TEXT, createdUtc TEXT, lastUpdatedByActorGuid TEXT, modifiedUtc TEXT,
 dataSetGuid TEXT NOT NULL REFERENCES DataSet(guid) ON DELETE NO ACTION,
 dataPointGuid TEXT NOT NULL REFERENCES DataPoint(guid) ON DELETE NO ACTION,
 UNIQUE(dataSetGuid,dataPointGuid)
) STRICT;
CREATE INDEX IX_DataSetMembership_Point_Set ON DataSetMembership(dataPointGuid,dataSetGuid);
