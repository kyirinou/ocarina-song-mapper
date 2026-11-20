const ImportLimits=Object.freeze({
  project:20*1024*1024,tabs:20*1024*1024,image:20*1024*1024,
  midi:10*1024*1024,musicxml:1024*1024,audio:50*1024*1024,
  text:1024*1024,pixels:12000000,pdfPages:30
});
function assertImportText(text,label='Notation'){
  if(typeof text!=='string'||text.length>ImportLimits.text||new TextEncoder().encode(text).byteLength>ImportLimits.text){
    throw Error(label+' is too large. Import up to 1 MiB of text at a time.');
  }
}
async function assertImportFile(file,kind){
  const maximum=ImportLimits[kind];
  if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('Choose a file containing data.');
  if(!maximum||file.size>maximum){
    throw Error('This file is too large. Import up to '+Math.round(maximum/1024/1024)+' MiB at a time.');
  }
  const header=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const ascii=String.fromCharCode(...header);
  if(kind==='midi'&&!ascii.startsWith('MThd'))throw Error('Choose a valid Standard MIDI file.');
  if(kind==='project'&&!/\.json$/i.test(file.name))throw Error('Choose an OSM JSON project backup.');
  if(kind==='musicxml'&&!/\.(xml|musicxml)$/i.test(file.name))throw Error('Choose an uncompressed XML or MusicXML file.');
  if(kind==='audio'){
    const wav=ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WAVE';
    const mp3=ascii.startsWith('ID3')||(header[0]===255&&(header[1]&224)===224);
    if(!wav&&!mp3)throw Error('Choose a valid WAV or MP3 recording.');
  }
  return header;
}
function assertImageDimensions(width,height){
  if(!(width>0&&height>0)||!Number.isFinite(width*height)||width*height>ImportLimits.pixels){
    throw Error('Use an image up to 12 megapixels. Crop it to the tab area or resize it and try again.');
  }
}
async function assertImportImage(file,allowWebP=false){
  await assertImportFile(file,'image');
  const bytes=new Uint8Array(await file.slice(0,262144).arrayBuffer());
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ascii=String.fromCharCode(...bytes.subarray(0,16));
  if(bytes.subarray(0,8).join(',')==='137,80,78,71,13,10,26,10'){
    if(bytes.length<24)throw Error('This PNG is incomplete.');
    assertImageDimensions(view.getUint32(16),view.getUint32(20));return;
  }
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){
    let offset=2;
    while(offset+4<=bytes.length&&bytes[offset]===255){
      const marker=bytes[offset+1];
      if(marker===217||marker===218)break;
      if(marker===255){offset++;continue;}
      const length=view.getUint16(offset+2);
      if(length<2)throw Error('This JPEG has an invalid segment.');
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
        if(offset+9>bytes.length)throw Error('This JPEG is incomplete.');
        assertImageDimensions(view.getUint16(offset+7),view.getUint16(offset+5));return;
      }
      offset+=length+2;
    }
    return;
  }
  if(allowWebP&&ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP'){
    if(ascii.slice(12,16)==='VP8X'&&bytes.length>=30){
      const dimension=index=>1+bytes[index]+bytes[index+1]*256+bytes[index+2]*65536;
      assertImageDimensions(dimension(24),dimension(27));
    }
    return;
  }
  throw Error(allowWebP?'Choose a valid PNG, JPEG, or WebP image.':'Choose a valid PNG or JPG image.');
}
