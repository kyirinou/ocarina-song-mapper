import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(new URL('../../source-import-safety.js',import.meta.url),'utf8');
const safety=vm.runInNewContext(source+'\n({ImportLimits,assertImportFile,assertImportText,assertImportImage,assertImageDimensions})',{
  TextEncoder,Uint8Array,DataView,String,Number,Object,Error
});
function file(name,bytes,size=bytes.length){
  return {name,size,slice(start,end){return {arrayBuffer:async()=>Uint8Array.from(bytes.slice(start,end)).buffer};}};
}
function png(width,height){
  const bytes=new Uint8Array(24);
  bytes.set([137,80,78,71,13,10,26,10]);
  const view=new DataView(bytes.buffer);view.setUint32(16,width);view.setUint32(20,height);
  return bytes;
}

test('import guards enforce the byte limit before reading the file',async()=>{
  let read=false;
  const large={name:'too-large.mid',size:safety.ImportLimits.midi+1,slice(){read=true;throw Error('Should not read');}};
  await assert.rejects(safety.assertImportFile(large,'midi'),/too large/);
  assert.equal(read,false);
});

test('MIDI upload checks its content signature independently of its filename',async()=>{
  await assert.rejects(safety.assertImportFile(file('song.mid',[0,1,2,3]),'midi'),/valid Standard MIDI/);
  await safety.assertImportFile(file('song.mid',[77,84,104,100,0,0,0,6]),'midi');
});

test('notation text limit counts UTF-8 bytes',()=>{
  assert.doesNotThrow(()=>safety.assertImportText('A4 C5'));
  assert.throws(()=>safety.assertImportText('😀'.repeat(300000)),/too large/);
});

test('PNG headers reject excessive decoded dimensions before an image decoder is used',async()=>{
  await assert.rejects(safety.assertImportImage(file('large.png',png(100000,100000))),/12 megapixels/);
  await safety.assertImportImage(file('small.png',png(1200,800)));
});

test('image signatures reject SVG content renamed as PNG',async()=>{
  const svg=new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  await assert.rejects(safety.assertImportImage(file('image.png',svg)),/valid PNG or JPG/);
});

test('decoded dimension guard rejects invalid and oversized images',()=>{
  for(const dimensions of [[0,100],[100,-1],[Infinity,100],[4000,4000]]){
    assert.throws(()=>safety.assertImageDimensions(...dimensions),/12 megapixels/);
  }
  assert.doesNotThrow(()=>safety.assertImageDimensions(4000,3000));
});

test('project and audio inputs reject empty or unsupported data',async()=>{
  await assert.rejects(safety.assertImportFile(file('empty.json',[]),'project'),/containing data/);
  await assert.rejects(safety.assertImportFile(file('project.txt',[123,125]),'project'),/JSON project/);
  await assert.rejects(safety.assertImportFile(file('audio.mp3',[1,2,3,4]),'audio'),/valid WAV or MP3/);
});
