// Find round ink islands (covered holes) and round enclosed gaps (open holes).
function tabHoleCandidates(rgba,width,box){
const {l,t,w,h}=box;
const size=Math.min(w,h);
const ink=new Uint8Array(w*h);
let light=0,dark=255;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const p=((t+y)*width+l+x)*4;
const value=rgba[p+3]>128?(rgba[p]+rgba[p+1]+rgba[p+2])/3:255;
light=Math.max(light,value);dark=Math.min(dark,value);
}
if(light-dark<65)return [];
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const p=((t+y)*width+l+x)*4;
ink[y*w+x]=rgba[p+3]>128&&(rgba[p]+rgba[p+1]+rgba[p+2])/3<(light+dark)/2?1:0;
}
const holes=[];
const seen=new Uint8Array(ink.length);
for(let start=0;start<ink.length;start++){
if(seen[start])continue;
const value=ink[start],queue=[start];seen[start]=1;
let left=w,right=0,top=h,bottom=0,sx=0,sy=0;
for(let i=0;i<queue.length;i++){
const p=queue[i],x=p%w,y=Math.floor(p/w);
left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);sx+=x;sy+=y;
for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
const nx=x+dx,ny=y+dy,n=ny*w+nx;
if(nx>=0&&nx<w&&ny>=0&&ny<h&&!seen[n]&&ink[n]===value){seen[n]=1;queue.push(n);}
}
}
const a=right-left+1,b=bottom-top+1;
if(left===0||right===w-1||top===0||bottom===h-1||Math.min(a,b)<Math.max(2,size*.015)||
Math.max(a,b)>size*.17||a/b<.55||a/b>1.8||queue.length/(a*b)<.55)continue;
holes.push({x:(sx/queue.length+.5)/w,y:(sy/queue.length+.5)/h,covered:Boolean(value)});
}
return holes;
}

function matchTabHoles(holes){
if(holes.length<12||holes.length>22)return null;
const layouts=[
fingeringHoles.map(([x,y])=>[(x-10)/994,(y-10)/950]),
wideTabHoles.map(([x,y])=>[(x+.5)/46,(y+.5)/39])
];
const results=[];
for(const layout of layouts)for(const scale of [.8,.9,1,1.1,1.2]){
// Use one observed hole as an anchor and fit the other eleven relative positions.
for(const anchor of holes){
const [ax,ay]=layout[3];
const pairs=layout.map(([x,y],index)=>holes.map((hole,id)=>({
index,id,cost:(hole.x-anchor.x-(x-ax)*scale)**2+(hole.y-anchor.y-(y-ay)*scale)**2
})).sort((a,b)=>a.cost-b.cost));
const used=new Set();let mask=0,cost=0,valid=true;
for(const pair of pairs.sort((a,b)=>a[0].cost-b[0].cost)){
const nearest=pair.find(candidate=>!used.has(candidate.id));
if(!nearest||nearest.cost>.0036){valid=false;break;}
used.add(nearest.id);cost+=nearest.cost;
if(holes[nearest.id].covered)mask|=1<<nearest.index;
}
if(valid&&cost<.017)results.push({cost,pitch:fingeringMasks.indexOf(mask)+69});
}
}
results.sort((a,b)=>a.cost-b.cost);
const best=results[0];
if(!best||best.pitch<69||results.some(item=>item.pitch!==best.pitch&&item.cost<best.cost+.0015))return null;
return best.pitch;
}

function scanTabGeometry(rgba,width,height){
const {boxes}=findFingeringBoxes(rgba,width,height,585,.55,1.9,28,25);
const candidates=boxes.map(box=>({...box,pitch:matchTabHoles(tabHoleCandidates(rgba,width,box))}));
const matches=candidates.filter(box=>box.pitch!==null);
if(!matches.length)return null;
// Reject partial matches when another similarly sized drawing is unreadable.
const reference=matches[0];
if(candidates.some(box=>box.pitch===null&&Math.abs(box.w/reference.w-1)<.2&&Math.abs(box.h/reference.h-1)<.2))return null;
const rows=[];
for(const box of matches.sort((a,b)=>a.t-b.t)){
const row=rows.find(group=>Math.abs(group[0].t-box.t)<reference.h*.4);
if(row)row.push(box);else rows.push([box]);
}
return rows.flatMap(row=>row.sort((a,b)=>a.l-b.l).map(box=>box.pitch));
}
