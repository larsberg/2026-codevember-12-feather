// Split the inherited Strudel query arcs at beat boundaries so onset zero
// remains audible even when a frame straddles a beat.
export function featherScoreEvents(from,to,tempo) {
  if(!(to>from)||!(tempo>0))return [];
  return featherBeatEvents(Math.max(0,from)*tempo/60,to*tempo/60,tempo);
}
export function featherBeatEvents(start,end,tempo){
  if(!(end>start)||!(tempo>0))return [];
  const events=[];
  for(let beat=Math.floor(start);beat<=Math.floor(end);beat++){
    const a=Math.max(start,beat)-beat,b=Math.min(end,beat+1)-beat;
    if(b<=a)continue;
    events.push({serial:beat,from:a===0?-.001:a,to:b,duration:60/tempo,voices:[beat%2]});
  }
  return events;
}
