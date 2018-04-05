var relations = ["left", "right", "above", "below", "near", "far"];
var current_relation = "left";
var relation_memberships = {};
var can_ref, can_main, can_buf, cans={}, ps={};
var ctx_ref, ctx_main, ctx_buf;
var has_data = {};
var main_pos = [101,101];

init = function() {
  // offscreen canvas for reference object
  can_ref = document.createElement("canvas");
  can_ref.width = 100; can_ref.height = 100;
  if (can_ref.getContext) ctx_ref = can_ref.getContext("2d");

  // offscreen canvas for main object
  can_main = document.createElement("canvas");
  can_main.width = 100; can_main.height = 100;
  if (can_main.getContext) ctx_main = can_main.getContext("2d");
  
  // offscreen canvas for mixing
  can_buf = document.createElement("canvas");
  can_buf.width = 100; can_buf.height = 100;
  if (can_buf.getContext) ctx_buf = can_buf.getContext("2d");

  // big onscreen canvas, scaled by factor 4
  can_big = document.getElementById("canvas_big");
  can_big.onclick = function(evt) {
    if (can_big.onmousemove) can_big.onmousemove = null;
    else can_big.onmousemove = function(evt) {
      placeMainObject(Math.round((evt.pageX-can_big.offsetLeft)/4),
                      Math.round((evt.pageY-can_big.offsetTop)/4));
    };
    placeMainObject(Math.round((evt.pageX-can_big.offsetLeft)/4),
                    Math.round((evt.pageY-can_big.offsetTop)/4));
  };
  can_big.width = 400; can_big.height = 400;
  if (can_big.getContext) ctx_big = can_big.getContext("2d");
  ctx_big.scale(4,4);

  // onscreen canvases for left, right, above and below relations  
  init_canvas = function(dir) {
    cans[dir] = document.getElementById("canvas_"+dir);
    cans[dir].onclick = function() { calc(dir, cans[dir], true); };
  }
  for (var i=0; i<relations.length; i++) {
    init_canvas(relations[i]);
    ps[relations[i]] = document.getElementById("p_"+relations[i]);
  }
  
  // register listeners on select tags
  document.getElementById("ref_obj_select").onchange = function(evt) {
    ref_obj(evt.target.value);
    //update_display();
  };
  document.getElementById("main_obj_select").onchange = function(evt) {
    main_obj(evt.target.value);
    //update_display();
  };
}

/// Creates and returns a matrix with the same size as the canvas. There are two
/// values that can be passed as 'mode':
/// "object": canvas pixel with alpha==0 is translated into zero, otherwise one
/// "landscape": canvas pixel blue channel is linearely mapped: 255->1, 0->0.
canvas_to_matrix = function(can, mode) {
  var w = can.width; var h = can.height;
  var img = can.getContext("2d").getImageData(0, 0, w, h).data;
  var M = Matrix.Zero(w,h);
  if (mode == "object") {
    for (var i=0;i<w;i++) for (var j=0;j<h;j++) {
      M.elements[i][j] = img[4*(i*w+j)+3] == 0 ? 0 : 1;
    }
  } else if (mode == "landscape") {
    for (var i=0;i<w;i++) for (var j=0;j<h;j++) {
      M.elements[i][j] = img[4*(i*w+j)] / 255;;
    }
  }
  return M;
}

/// Copies the matrix M to a buffer canvas and paints this to canvas 'can'.
matrix_to_canvas = function(M, can) {
  var w = M.cols(); var h = M.rows();
  if (can_buf.width != w || can_buf.height != h) {
    can_buf.width = w;
    can_buf.height = h;
    ctx_buf = can_buf.getContext("2d");
  }
  ctx_buf.clearRect(0,0,w,h);
  var image_buf = ctx_buf.getImageData(0,0,w,h);
  var imgData = image_buf.data;
  for (var i=0;i<h;i++) for (var j=0;j<w;j++) {
    var idx = 4*(i*w+j);
    if (M.elements[i][j] == -1) continue;
    var val = M.elements[i][j]*255;
    imgData[idx] = val;
    imgData[idx+1] = val;
    imgData[idx+2] = val;
    imgData[idx+3] = 255;
  }
  ctx_buf.putImageData(image_buf, 0, 0);
  var ctx = can.getContext("2d");
  ctx.clearRect(0,0,w,h);
  ctx.drawImage(can_buf, 0, 0);
}

update_display = function() {
  ctx_big.clearRect(0,0,100,100);
  if (has_data[current_relation]) {
    ctx_big.drawImage(cans[current_relation],0,0);
  }
  ctx_big.drawImage(can_ref, 0, 0);
  ctx_big.drawImage(can_main, main_pos[0], main_pos[1]);
  
  // draw text representing the relations
  ctx_big.scale(0.25,0.25);
  ctx_big.fillStyle = "red";
  drawText = function(rel, x, y, h_align, v_align) {
    var m = relation_memberships[rel];
    if (!m) return;
    ctx_big.textAlign = h_align;
    ctx_big.textBaseline = v_align;
    ctx_big.font = "" + Math.round(m*24) + "pt Arial";
    ctx_big.fillText(rel, x, y);
  };
  drawText("left",   10, 200, "left",   "middle");
  drawText("right", 390, 200, "right",  "middle");  
  drawText("above", 200,  10, "center", "top");
  drawText("below", 200, 390, "center", "bottom");
  drawText("near",   10, 390, "left",   "bottom");
  drawText("far",   390, 390, "right",  "bottom");
  ctx_big.scale(4,4);
}

placeMainObject = function(x, y) {
  if (x != null && y != null) main_pos = [x-50, y-50];
  active_relations = [];
  for (var i=0; i<relations.length; i++) {
    var rel = relations[i];
    if (!has_data[rel]) continue;
    var ms = calcObjectMembership(canvas_to_matrix(cans[rel], 'landscape'),
                                  canvas_to_matrix(can_main, 'object'),
                                  main_pos[0], main_pos[1]);
    if (rel == "far") relation_memberships[rel] = ms[0];
    else if (rel == "near") relation_memberships[rel] = ms[2];
    else relation_memberships[rel] = ms[1];
    ms[0] = ms[0].toFixed(2);
    ms[1] = ms[1].toFixed(2);
    ms[2] = ms[2].toFixed(2);
    ps[rel].innerHTML = "[" + ms.join(", ") + "]";
  }
  update_display();
}

ref_obj = function(str) {
  if (!ctx_ref) return;
  ctx_ref.clearRect(0,0,100,100);
  ctx_ref.fillStyle = "rgba(0,0,200,0.8)";
  ctx_ref.strokeStyle = "rgba(0,0,200,0.8)";
  switch(str) {
    case "circle":
      ctx_ref.beginPath();
      ctx_ref.arc(50,50,8,0,2*Math.PI,true);
      ctx_ref.fill();
      break;
    case "squares": 
      ctx_ref.fillRect(42,42,10,10);
      ctx_ref.fillRect(48,48,10,10);
      break;
    case "ring":
      ctx_ref.lineWidth = 2;
      ctx_ref.beginPath();
      ctx_ref.arc(50,50,15,0,2*Math.PI,true);
      ctx_ref.stroke();
      break;
    case "T":
      //ctx_ref.drawSvg('img.svg');
      ctx_ref.fillRect(27,32,46,6);
      ctx_ref.fillRect(55,38,6,30);
      break;
  }
  has_data = {};
  relation_memberships = {};
  for (var i=0;i<relations.length;i++) {
    var rel = relations[i];
    ps[rel].innerHTML = "[?, ?, ?]";
    cans[rel].getContext("2d").clearRect(0,0,100,100);
  }
  update_display();
}

main_obj = function(str) {
  if (!ctx_main) return;
  ctx_main.clearRect(0,0,100,100);
  ctx_main.fillStyle = "rgba(0,200,0,0.8)";
  ctx_main.strokeStyle = "rgba(0,200,0,0.8)";
  switch(str) {
    case "circle":
      ctx_main.beginPath();
      ctx_main.arc(50,50,6,0,2*Math.PI,true);
      ctx_main.fill();
      break;
    case "bar": 
      ctx_main.fillRect(40,48,20,4);
      break;
    case "ring":
      ctx_main.lineWidth = 2;
      ctx_main.beginPath();
      ctx_main.arc(50,50,10,0,2*Math.PI,true);
      ctx_main.stroke();
      break;
    case "angle":
      //ctx_main.drawSvg('img.svg');
      ctx_main.fillRect(42,42,4,16);
      ctx_main.fillRect(46,54,12,4);
      break;
  }
  placeMainObject();
  update_display();
}

/// Calculates the spatial membership landscape and draws it to 'can'. Possible
/// values for 'dir' are "left", "right", "above" and "below".
calc = function(rel, can, fast) {
  var t_start = Date.now();
  var ref = canvas_to_matrix(can_ref, 'object');
  // call membership function
  var landscape = fast ? spatial_membership_fast(ref, rel_func[rel], mem_func[rel])
                       : spatial_membership_naive(ref, rel_func[rel], mem_func[rel]);
  
  matrix_to_canvas(landscape, can);
  can.getContext("2d").drawImage(can_ref, 0, 0);
  has_data[rel] = true;
  current_relation = rel;
  console.log('calc: ' + (Date.now()-t_start) + ' ms.');
  update_display();
}

