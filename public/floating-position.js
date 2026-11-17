export function floatingPosition(anchor,panel,viewport) {
  const margin=12,gap=10;
  const width=Math.max(1,Math.min(panel.width,viewport.width-2*margin));
  const height=Math.max(1,Math.min(panel.height,viewport.height-2*margin));
  let left,top;
  if(anchor.right+gap+width<=viewport.width-margin){left=anchor.right+gap;top=anchor.top;}
  else if(anchor.left-gap-width>=margin){left=anchor.left-gap-width;top=anchor.top;}
  else if(anchor.bottom+gap+height<=viewport.height-margin){left=anchor.left;top=anchor.bottom+gap;}
  else if(anchor.top-gap-height>=margin){left=anchor.left;top=anchor.top-gap-height;}
  else {left=anchor.left;top=anchor.bottom+gap;}
  return {left:Math.max(margin,Math.min(left,viewport.width-margin-width)),top:Math.max(margin,Math.min(top,viewport.height-margin-height)),width,maxHeight:Math.max(1,viewport.height-2*margin)};
}
