precision highp float;

attribute vec3 aPosition;

void main() {

  vec4 positionVec4 = vec4(aPosition, 1.0); // Copy the position data into a vec4, adding 1.0 as the w parameter

  positionVec4.xy = positionVec4.xy * 2.0 - 1.0; // Scale to make the output fit the canvas. 

  gl_Position = positionVec4;

}