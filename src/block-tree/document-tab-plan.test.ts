import {expect,it,vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {clone} from './clone';
import {documentTabParentFor} from './document-tab-plan';
import {deriveLocations,validateRepository} from './repository';
import type {RepositoryOperation} from './types';

const tab = {type:'tab-block',metadata:{documentTarget:{version:1,documentId:'document'}}};
function fixture() {
 const editor=new ReactiveEditor({type:'workspace-block',children:[{type:'tab-row-block',children:[]}]});
 const view=editor.createView('tabs'),parent=view.node(view.state.rootKey)!.children[0];
 return {editor,view,parent};
}

it('inserts a document tab and replays Undo without copying the workspace, with consistent projections and indexes',()=>{
 const {editor,view,parent}=fixture(),repository=editor.repository;
 const before=repository.snapshot(),snapshot=vi.spyOn(repository,'snapshot');
 const placement=editor.commands.insert(tab,{kind:'at',parentKey:parent,index:0});
 const check=()=>{
  validateRepository(repository.readState());
  for(const [key,location] of deriveLocations(repository.readState()))expect(repository.locationOf(key)).toEqual(location);
 };
 expect(view.node(parent)!.children).toEqual([view.nodeForPlacement(placement)!.key]);check();
 repository.undo();expect(view.node(parent)!.children).toEqual([]);check();
 repository.redo();expect(view.nodeForPlacement(placement)?.viewType).toBe('tab-block');check();
 repository.undo();expect(snapshot).not.toHaveBeenCalled();
 expect(Object.keys(repository.readState().contents)).toEqual(Object.keys(before.contents));
 editor.dispose();
});

it('rejects detached and non-leaf tabs atomically instead of using the leaf insertion shortcut',()=>{
 const {editor,parent}=fixture(),repository=editor.repository;
 let operations:RepositoryOperation[]=[];
 const commit=vi.spyOn(repository,'commit').mockImplementation((_label,ops)=>{operations=clone(ops);});
 editor.commands.insert(tab,{kind:'at',parentKey:parent,index:0});commit.mockRestore();
 const state=repository.snapshot(),refs=new Map(Object.keys(state.contents).map(key=>[key,repository.contentReferenceCount(key)]));
 expect(documentTabParentFor(state,operations,refs)).toBeDefined();
 const child=operations.find(op=>op.kind==='put-content'&&!state.contents[op.record.key]);
 const owner=operations.find(op=>op.kind==='put-content'&&!!state.contents[op.record.key]);
 if(child?.kind!=='put-content'||owner?.kind!=='put-content')throw Error('Missing insertion records');
 child.record.children=['missing-child'];
 expect(documentTabParentFor(state,operations,refs)).toBeUndefined();
 expect(()=>repository.commit('Invalid tab',operations)).toThrow();
 child.record.children=[];owner.record.children=[];
 expect(documentTabParentFor(state,operations,refs)).toBeUndefined();
 expect(()=>repository.commit('Detached tab',operations)).toThrow();
 expect(repository.snapshot()).toEqual(state);expect(repository.canUndo()).toBe(false);
 editor.dispose();
});
