/*******************************************************************************
Spatial Relation Analysis
29. Jun 2011, Erik Weitnauer

Javascript implementation of the algorithmus from Isabelle Bloch in her paper
"Fuzzy Relative Position Between Objects in Image Processing: A Morphological
Approach", IEEE Transactions on Pattern Analysis and Machine Intelligence,
pp. 657-664, July, 1999.

Copyright 2011 Erik Weitnauer (eweitnauer@gmail.com)
You may use this code for any purpose, just include this copyright notice. The
code is distributed without any warranty.
*******************************************************************************/

function beta_right(dx,dy) {
  // arccos([dx, dy] * [1, 0] / length([dx,dy]))
  if (dx == 0 && dy == 0) return 0;
  else return Math.acos(dx/Math.sqrt(dx*dx+dy*dy)); // right of
}

function beta_left(dx,dy) {
  // arccos([dx, dy] * [-1, 0] / length([dx,dy]))
  if (dx == 0 && dy == 0) return 0;
  else return Math.acos(-dx/Math.sqrt(dx*dx+dy*dy)); // left of
}

function beta_above(dx,dy) {
  // arccos([dx, dy] * [0, -1] / length([dx,dy]))
  if (dx == 0 && dy == 0) return 0;
  else return Math.acos(-dy/Math.sqrt(dx*dx+dy*dy)); // above
}

function beta_below(dx,dy) {
  // arccos([dx, dy] * [0, 1] / length([dx,dy]))
  if (dx == 0 && dy == 0) return 0;
  else return Math.acos(dy/Math.sqrt(dx*dx+dy*dy)); // below
}

function beta_membership(val) {
  return 1-2*val/Math.PI;
}

function dist_euklid(dx, dy) {
  return Math.sqrt(dx*dx + dy*dy);
}

/// use a sigmoid function which is 0.5 at a distance of 10 pixels
function near_membership(val) {
  return 1-1/(1+Math.exp(0.35*(10-val)));
}

/// use a sigmoid function which is 0.5 at a distance of 20 pixels
function far_membership(val) {
  if (val == 0) return 0;
  return 1/(1+Math.exp(0.3*(20-val)));
}

rel_func = {'right': beta_right, 'left': beta_left,
            'above': beta_above, 'below': beta_below,
            'near': dist_euklid, 'far': dist_euklid};
mem_func = {'right': beta_membership, 'left': beta_membership,
            'above': beta_membership, 'below': beta_membership,
            'near': near_membership, 'far': far_membership};

/// Pass image of reference object as Sylvester Matrix. Each point that belongs
/// to the object must be 1. The second parameter 'f_rel' is a function that
/// accepts two parameters dx and dy and returns the deviation from the spatial
/// relation at hand. A return value of zero means perfect fit to the relation.
/// The third parameter 'f_mem' in a function that maps the values from f_rel
/// to membership values.
/// Returns a matrix containing the spatial membership and -1 for the position
/// of the reference object.
function spatial_membership_naive(img, f_rel, f_mem) {
  var t_start = Date.now();
  var set = Matrix.Zero(img.rows(), img.cols());
  // iterate over the image containing the reference object
  for (var i=0;i<img.rows();i++) for (var j=0;j<img.cols();j++) {
    // skip if point is not part of object
    if (img.elements[i][j] != 1) continue;
    // iterate over fuzzy set to check whether we got a better match somewhere
    for (var si=0;si<set.rows();si++) for (var sj=0;sj<set.cols();sj++) {
      if (img.elements[si][sj] == 1) set.elements[si][sj] = -1;
      else {
        var rel = f_rel(sj-j, si-i);
        set.elements[si][sj] = Math.max(f_mem(rel), set.elements[si][sj]);
      }
    }
  }
  console.log('calc: ' + (Date.now()-t_start) + ' ms.');
  return set;
}

/// Same as naive implementation, but much faster O(width * height). Not exact.
function spatial_membership_fast(img, f_rel, f_mem) {
  var t_start = Date.now();
  // we will store points with best direction in 'set' first
  var set = Matrix.Zero(img.rows(), img.cols());
  // initialize
  for (var i=0;i<set.rows();i++) for (var j=0;j<set.cols();j++) {
    // is this a point in the reference object?
    if (img.elements[i][j] == 1) set.elements[i][j] = [i,j,0];
  }
  var pass = function(i,j) {
    var current = set.elements[i][j];
    var check = function(ref) {
      var rel = f_rel(j-ref[1], i-ref[0]);
      if (current == 0 || rel <= current[2]) {
        current = [ref[0], ref[1], rel];
      }
    }
    if (i>0) {
      if (j>0 && set.elements[i-1][j-1]) check(set.elements[i-1][j-1]);
      if (set.elements[i-1][j]) check(set.elements[i-1][j]);
      if (j<set.cols()-1 && set.elements[i-1][j+1]) check(set.elements[i-1][j+1]);
    }
    if (i<set.rows()-1) {
      if (j>0 && set.elements[i+1][j-1]) check(set.elements[i+1][j-1]);
      if (set.elements[i+1][j]) check(set.elements[i+1][j]);
      if (j<set.cols()-1 && set.elements[i+1][j+1]) check(set.elements[i+1][j+1]);
    }
    if (j>0 && set.elements[i][j-1]) check(set.elements[i][j-1]);
    if (j<set.cols()-1 && set.elements[i][j+1]) check(set.elements[i][j+1]);
    // take the best reference point
    set.elements[i][j] = current;
  }

  // first pass: forward iteration over set
  for (var i=0;i<set.rows();i++) for (var j=0;j<set.cols();j++) pass(i,j);
  // second pass: backward iteration over set
  for (var i=set.rows()-1;i>=0;i--) for (var j=set.cols()-1;j>=0;j--) pass(i,j);
  
  // translate set reference points to memberships
  for (var i=0;i<set.rows();i++) for (var j=0;j<set.cols();j++) {
    if (img.elements[i][j]==1) set.elements[i][j] = -1;
    else set.elements[i][j] = f_mem(set.elements[i][j][2]);
  }
  console.log('spatial_membership_fast: ' + (Date.now()-t_start) + ' ms.');
  return set;
}

/// Calculates the membership of the object in the matrix 'obj' when placed at
/// 'x', 'y' (integers) in the membership landscape defined by the matrix 'set'.
/// Points in 'set' that are -1 are ignored. E.g., all points of the reference
/// object can be marked as -1.
/// Returns three measures [necessity, average, possibility].
calcObjectMembership = function(set, obj, x, y) {
  var nec = 1;
  var avg = 0;
  var num = 0;
  var pos = 0;
  // iterate over img one time
  for (var i=0;i<obj.rows();i++) for (var j=0;j<obj.cols();j++) {
    if (!obj.elements[i][j]) continue; // skip points not in object
    if (j+x>=set.cols() || j+x<0) continue; // skip points outside 'set'
    if (i+y>=set.rows() || i+y<0) continue; // skip points outside 'set'
    var val = set.elements[i+y][j+x];
    if (val == -1) continue; // skip points that overlap with reference object
    nec = Math.min(nec, val);
    avg += val;
    num++;
    pos = Math.max(pos, val);
  }
  avg /= num;
  return [nec, avg, pos];
}
