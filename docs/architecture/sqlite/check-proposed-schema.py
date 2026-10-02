"""P0 proposal smoke only. Uses two in-memory SQLite DBs; never opens a vault.
Run: python3 docs/architecture/sqlite/check-proposed-schema.py
Not a substitute for the planned Node worker/migration/performance gates.
"""
import json
from pathlib import Path
import sqlite3

directory = Path(__file__).resolve().parent
current, audit = sqlite3.connect(":memory:"), sqlite3.connect(":memory:")
checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)


def rejects(name, sql, values=()):
    try:
        current.execute(sql, values)
    except sqlite3.IntegrityError:
        checks.append(name)
    else:
        raise AssertionError(name)


def resource(guid, block):
    current.execute("""INSERT INTO Resource(guid,path,typename,format,rootBlockGuid,
      contentHash,indexedUtc,extractionProfile,indexStatus)
      VALUES(?,?, 'document-block','mutable-document',?,'hash','now','proposal-1','complete')""",
                    (guid, guid + '.mutable.json', block))
    current.execute("INSERT INTO Block(guid,resourceGuid,typename,authoredType,coordinate,cellCount) VALUES(?,?,'standoff-editor-block','standoff-editor-block','cell',12)", (block, guid))


try:
    current.executescript((directory / 'mutable-proposed.sql').read_text())
    audit.executescript((directory / 'audit-proposed.sql').read_text())
    check('both proposed schemas parse independently', True)
    check('foreign keys enabled', current.execute('PRAGMA foreign_keys').fetchone()[0] == 1)
    current.execute("INSERT INTO Actor(guid,typename,name) VALUES('actor','Human','Writer')")
    current.execute("INSERT INTO Entity(guid,name,nameKey) VALUES('entity','Poe','poe'),('other','Poe','poe')")
    check('same names do not merge Entity identity', current.execute('SELECT count(*) FROM Entity').fetchone()[0] == 2)
    rejects('duplicate Entity identity rejected', "INSERT INTO Entity(guid,name,nameKey) VALUES('entity','Different','different')")
    current.execute("INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES('alias','entity','Edgar','edgar','curated')")
    rejects('duplicate normalized alias rejected', "INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES('alias2','entity','EDGAR','edgar','observed')")
    rejects('Relationship requires Entity endpoint', "INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('bad','entity','knows','missing')")
    current.execute("INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('relationship','entity','knows','other')")
    relation_columns = {row[1] for row in current.execute('PRAGMA table_info(Relationship)')}
    check('Relationship has no Resource/Block ownership columns', not relation_columns.intersection({'resourceGuid','documentGuid','sourceBlockGuid'}))
    resource('resource-a', 'block-a')
    resource('resource-b', 'block-b')
    current.execute("""INSERT INTO BlockRelation(guid,resourceGuid,sourceBlockGuid,identityKind,typename,targetBlockGuid,targetResourceGuid,targetScope,kind)
      VALUES('edge','resource-a','block-a','authored','children','block-b','resource-b','document','owned')""")
    current.execute("DELETE FROM Resource WHERE guid='resource-b'")
    check('missing external target preserves authored incoming relation', current.execute("SELECT targetBlockGuid,kind FROM BlockRelation WHERE guid='edge'").fetchone() == ('block-b', 'owned'))
    current.execute("""INSERT INTO StandoffProperty(guid,resourceGuid,sourceBlockGuid,authoredId,identityKind,logicalGuid,typename,startIndex,endIndex,coordinate,targetEntityGuid,resolution,attributes)
      VALUES('segment-a','resource-a','block-a','segment','authored','logical','codex/entity-reference',0,5,'cell','missing-entity','direct','{}')""")
    check('missing Entity stays unresolved without inventing canonical knowledge', current.execute("SELECT count(*) FROM Entity WHERE guid='missing-entity'").fetchone()[0] == 0)
    current.execute("""INSERT INTO StandoffProperty(guid,resourceGuid,sourceBlockGuid,identityKind,logicalGuid,startIndex,endIndex,coordinate,definitionResourceGuid,definitionAnnotationId,resolution,attributes)
      VALUES('segment-b','resource-a','block-a','authored','logical-foreign',5,8,'cell','missing-resource','definition','unresolved','{}')""")
    check('unresolved linked definition retained', current.execute("SELECT resolution FROM StandoffProperty WHERE guid='segment-b'").fetchone()[0] == 'unresolved')
    rejects('wrong source resource rejected', """INSERT INTO StandoffProperty(guid,resourceGuid,sourceBlockGuid,identityKind,logicalGuid,startIndex,endIndex,coordinate,resolution,attributes)
      VALUES('bad','wrong-resource','block-a','authored','bad',0,1,'cell','direct','{}')""")
    rejects('negative range rejected', "UPDATE StandoffProperty SET startIndex=-1 WHERE guid='segment-a'")
    check('half-open adjacent ranges do not overlap', current.execute("SELECT guid FROM StandoffProperty WHERE sourceBlockGuid='block-a' AND startIndex < 8 AND endIndex > 5").fetchall() == [('segment-b',)])
    current.execute("UPDATE StandoffProperty SET targetEntityGuid='entity' WHERE guid='segment-a'")
    rejects('known saved Entity references protect deletion', "DELETE FROM Entity WHERE guid='entity'")
    current.execute("INSERT INTO BlockTextRun(blockGuid,ordinal,text,boundaries) VALUES('block-a',0,'raven','[0,1,2,3,4,5]'),('block-a',1,'nevermore','[6,7,8,9,10,11,12,13,14,15]')")
    check('FTS finds inserted text', current.execute("SELECT count(*) FROM BlockSearch WHERE BlockSearch MATCH 'raven'").fetchone()[0] == 1)
    check('FTS phrase does not bridge an inline object', current.execute("SELECT count(*) FROM BlockSearch WHERE BlockSearch MATCH '\"raven nevermore\"'").fetchone()[0] == 0)
    current.execute("UPDATE BlockTextRun SET text='crow' WHERE ordinal=0")
    check('FTS update removes obsolete terms', current.execute("SELECT count(*) FROM BlockSearch WHERE BlockSearch MATCH 'raven'").fetchone()[0] == 0)
    current.execute("INSERT INTO BlockSearch(BlockSearch) VALUES('rebuild')")
    check('FTS rebuild restores equivalent current search', current.execute("SELECT count(*) FROM BlockSearch WHERE BlockSearch MATCH 'crow'").fetchone()[0] == 1)
    current.commit()
    current.execute('BEGIN')
    current.execute("UPDATE BlockTextRun SET text='incorrect' WHERE ordinal=0")
    current.execute("UPDATE StandoffProperty SET endIndex=2 WHERE guid='segment-a'")
    current.rollback()
    check('transaction rollback preserves text and ranges together', current.execute("SELECT text FROM BlockTextRun WHERE ordinal=0").fetchone()[0] == 'crow' and current.execute("SELECT endIndex FROM StandoffProperty WHERE guid='segment-a'").fetchone()[0] == 5)
    check('FTS rollback matches base rows', current.execute("SELECT count(*) FROM BlockSearch WHERE BlockSearch MATCH 'incorrect'").fetchone()[0] == 0)
    current.execute("UPDATE Entity SET name='Edgar Allan Poe', nameKey='edgar allan poe' WHERE guid='entity'")
    check('Entity FTS follows preferred-name changes', current.execute("SELECT count(*) FROM EntitySearch WHERE EntitySearch MATCH 'Allan'").fetchone()[0] == 1)
    check('alias FTS independent of preferred name', current.execute("SELECT count(*) FROM EntityAliasSearch WHERE EntityAliasSearch MATCH 'Edgar'").fetchone()[0] == 1)
    audit.execute("INSERT INTO AuditMutation(guid,timestampUtc) VALUES('mutation','now')")
    audit.execute("INSERT INTO AuditEvent(guid,mutationGuid,operation,recordType,recordGuid,timestampUtc,afterJson) VALUES('event','mutation','update','Entity','entity','now','{}')")
    audit.close()
    check('audit absence does not prevent current knowledge reads', current.execute("SELECT name FROM Entity WHERE guid='entity'").fetchone()[0] == 'Edgar Allan Poe')
    current.execute('DELETE FROM Resource')
    check('derived removal cascades source rows', current.execute('SELECT count(*) FROM Block').fetchone()[0] == 0 and current.execute('SELECT count(*) FROM StandoffProperty').fetchone()[0] == 0 and current.execute('SELECT count(*) FROM BlockRelation').fetchone()[0] == 0)
    check('derived removal clears FTS', current.execute("SELECT count(*) FROM BlockSearch WHERE BlockSearch MATCH 'crow'").fetchone()[0] == 0)
    check('canonical knowledge survives derived rebuild', current.execute('SELECT count(*) FROM Entity').fetchone()[0] == 2 and current.execute('SELECT count(*) FROM EntityAlias').fetchone()[0] == 1 and current.execute('SELECT count(*) FROM Relationship').fetchone()[0] == 1 and current.execute('SELECT count(*) FROM Actor').fetchone()[0] == 1)
    check('foreign-key integrity', not current.execute('PRAGMA foreign_key_check').fetchall())
    check('database integrity', current.execute('PRAGMA integrity_check').fetchone()[0] == 'ok')
    print(json.dumps({'sqliteVersion': sqlite3.sqlite_version, 'passed': len(checks), 'checks': checks}, indent=2))
finally:
    current.close()
    audit.close()
